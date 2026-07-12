import { readFile, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalMutationDisposition,
  ActionJournalRecordType,
  ActionJournalStatus,
  ActionKind,
  ActionOutcome,
  ActionResolution,
  ActorKind,
  HarnessErrorCode,
  ResultStatus,
  createHarnessApplication,
  parseActionIntent,
  parseActionId,
  parseActionObservation,
  parseActionResolution,
  type ActionIntentRecord,
  type ActionObservationRecord,
  type ActionResolutionRecord,
  type TaskState,
} from "../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileActionJournalRepository,
  FileParentDirectoryDurability,
} from "../../src/infrastructure/index.js";
import { resolveTaskStorePaths } from "../../src/infrastructure/persistence/fileEventStore/taskStore/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();
const digest = `sha256:${"b".repeat(64)}`;
const actor = { kind: ActorKind.System, actorId: "action-journal-integration" };

afterEach(async () => runtimeStores.cleanup());

describe("File Action Journal Repository", () => {
  it("跨实例重放未知结果、Human 处置和恢复完成状态", async () => {
    const setup = await createSetup("liushi-action-journal-replay-");
    const embedded = createHarnessApplication({ storeRoot: setup.storeRoot });
    const created = await embedded.recordActionIntent.execute({
      record: intent(setup.task, actionIds[0], "write-a"),
    });
    expect(created.status).toBe(ResultStatus.Success);
    if (created.status !== ResultStatus.Success) {
      throw created.error;
    }
    expect(created.value.disposition).toBe(ActionJournalMutationDisposition.Appended);

    const duplicate = await setup.repository.createIntent(
      intent(setup.task, actionIds[1], "write-a"),
    );
    expect(duplicate.status).toBe(ResultStatus.Success);
    if (duplicate.status === ResultStatus.Success) {
      expect(duplicate.value.disposition).toBe(ActionJournalMutationDisposition.IdempotentReuse);
      expect(duplicate.value.state.intent.actionId).toBe(actionIds[0]);
    }

    await expectSuccess(
      setup.repository.appendObservation(
        observation(setup.task, actionIds[0], 2, ActionOutcome.OutcomeUnknown),
      ),
    );
    await expectSuccess(
      setup.repository.appendResolution(
        resolution(setup.task, actionIds[0], 3, ActionResolution.HumanRequired),
      ),
    );

    const restarted = createRepository(setup.storeRoot);
    const waiting = await restarted.load(locator(setup.task, actionIds[0]));
    expect(waiting.status).toBe(ResultStatus.Success);
    if (waiting.status === ResultStatus.Success) {
      expect(waiting.value.status).toBe(ActionJournalStatus.WaitingHuman);
    }
    const embeddedWaiting = await embedded.getActionJournal.execute({
      workspaceId: setup.task.workspaceId,
      taskId: setup.task.taskId,
      actionId: actionIds[0],
    });
    expect(embeddedWaiting.status).toBe(ResultStatus.Success);
    const recoverable = await restarted.listRecoverable(taskLocator(setup.task));
    expect(recoverable.status).toBe(ResultStatus.Success);
    if (recoverable.status === ResultStatus.Success) {
      expect(recoverable.value.map((state) => state.intent.actionId)).toEqual([actionIds[0]]);
    }

    await expectSuccess(
      restarted.appendObservation(
        observation(setup.task, actionIds[0], 4, ActionOutcome.Succeeded),
      ),
    );
    await expectSuccess(
      restarted.appendResolution(
        resolution(setup.task, actionIds[0], 5, ActionResolution.Recovered),
      ),
    );
    const completed = await restarted.listRecoverable(taskLocator(setup.task));
    expect(completed.status).toBe(ResultStatus.Success);
    if (completed.status === ResultStatus.Success) {
      expect(completed.value).toEqual([]);
    }

    const taskStatus = await createHarnessApplication({
      storeRoot: setup.storeRoot,
    }).getTaskStatus.execute({
      workspaceId: setup.task.workspaceId,
      taskId: setup.task.taskId,
    });
    expect(taskStatus.status).toBe(ResultStatus.Success);
  });

  it("并发相同幂等意图只追加一条 Intent，不同内容返回冲突", async () => {
    const setup = await createSetup("liushi-action-journal-idempotency-");
    const first = intent(setup.task, actionIds[0], "shared-key");
    const second = intent(setup.task, actionIds[1], "shared-key");
    const [left, right] = await Promise.all([
      setup.repository.createIntent(first),
      createRepository(setup.storeRoot).createIntent(second),
    ]);
    expect([left, right].some((result) => result.status === ResultStatus.Success)).toBe(true);
    for (const result of [left, right]) {
      if (result.status === ResultStatus.Failure) {
        expect(result.error.code).toBe(HarnessErrorCode.LockUnavailable);
      }
    }
    const retried = await setup.repository.createIntent(second);
    expect(retried.status).toBe(ResultStatus.Success);
    const dispositions = [left, right]
      .filter((result) => result.status === ResultStatus.Success)
      .map((result) => result.value.disposition)
      .sort();
    expect(dispositions).toContain(ActionJournalMutationDisposition.Appended);
    if (retried.status === ResultStatus.Success) {
      expect(retried.value.disposition).toBe(ActionJournalMutationDisposition.IdempotentReuse);
    }

    const conflict = await setup.repository.createIntent(
      intent(setup.task, actionIds[2], "shared-key", "different-target"),
    );
    expect(conflict.status).toBe(ResultStatus.Failure);
    if (conflict.status === ResultStatus.Failure) {
      expect(conflict.error.code).toBe(HarnessErrorCode.ActionConflict);
    }

    const paths = resolveTaskStorePaths(setup.storeRoot, setup.task.workspaceId, setup.task.taskId);
    const lines = (await readFile(paths.actionsFile, "utf8")).trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
  });

  it("损坏 Action Journal 时恢复查询 fail closed", async () => {
    const setup = await createSetup("liushi-action-journal-corrupt-");
    await expectSuccess(
      setup.repository.createIntent(intent(setup.task, actionIds[0], "corrupt-a")),
    );
    const paths = resolveTaskStorePaths(setup.storeRoot, setup.task.workspaceId, setup.task.taskId);
    const contents = await readFile(paths.actionsFile, "utf8");
    const envelope = JSON.parse(contents.trim()) as {
      record: { target: string };
    };
    envelope.record.target = "tampered-target";
    await writeFile(paths.actionsFile, `${JSON.stringify(envelope)}\n`, "utf8");

    const result = await setup.repository.listRecoverable(taskLocator(setup.task));

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.CorruptStore);
    }
  });
});

const actionIds = [
  "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "01ARZ3NDEKTSV4RRFFQ69G5FAW",
  "01ARZ3NDEKTSV4RRFFQ69G5FAX",
] as const;

async function createSetup(prefix: string): Promise<{
  storeRoot: string;
  task: TaskState;
  repository: FileActionJournalRepository;
}> {
  const storeRoot = await runtimeStores.create(prefix);
  const created = await createHarnessApplication({ storeRoot }).createTask.execute({
    workspaceId: "workspace-action-journal",
    source: "action-journal-integration",
    actor,
  });
  if (created.status !== ResultStatus.Success) {
    throw created.error;
  }
  return {
    storeRoot,
    task: created.value.task,
    repository: createRepository(storeRoot),
  };
}

function createRepository(storeRoot: string): FileActionJournalRepository {
  return new FileActionJournalRepository(storeRoot, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
}

function intent(
  task: TaskState,
  actionId: string,
  idempotencyKey: string,
  target = "packages/liushi-harness/src/index.ts",
): ActionIntentRecord {
  const parsed = parseActionIntent({
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Intent,
    actionId,
    workspaceId: task.workspaceId,
    taskId: task.taskId,
    sequence: 1,
    commandId: "command-action-journal",
    correlationId: "correlation-action-journal",
    idempotencyKey,
    kind: ActionKind.FileMutation,
    target,
    inputDigest: digest,
    postconditionDigest: digest,
    recoveryGuidance: "核对目标摘要并请求 Human 处置。",
    actor,
    recordedAt: "2026-07-12T00:00:00.000Z",
  });
  if (parsed.status !== ResultStatus.Success) {
    throw parsed.error;
  }
  return parsed.value;
}

function observation(
  task: TaskState,
  actionId: string,
  sequence: number,
  outcome: ActionOutcome,
): ActionObservationRecord {
  const parsed = parseActionObservation({
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Observation,
    actionId,
    workspaceId: task.workspaceId,
    taskId: task.taskId,
    sequence,
    outcome,
    evidenceIds: [`evidence-${sequence}`],
    ...(outcome === ActionOutcome.OutcomeUnknown ? { errorCode: "result_unknown" } : {}),
    actor,
    recordedAt: "2026-07-12T00:01:00.000Z",
  });
  if (parsed.status !== ResultStatus.Success) {
    throw parsed.error;
  }
  return parsed.value;
}

function resolution(
  task: TaskState,
  actionId: string,
  sequence: number,
  value: ActionResolution,
): ActionResolutionRecord {
  const parsed = parseActionResolution({
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Resolution,
    actionId,
    workspaceId: task.workspaceId,
    taskId: task.taskId,
    sequence,
    resolution: value,
    reason: "依据 Observation 选择确定性恢复处置。",
    actor,
    recordedAt: "2026-07-12T00:02:00.000Z",
  });
  if (parsed.status !== ResultStatus.Success) {
    throw parsed.error;
  }
  return parsed.value;
}

function locator(task: TaskState, actionId: string) {
  const parsed = parseActionId(actionId);
  if (parsed.status !== ResultStatus.Success) {
    throw parsed.error;
  }
  return { workspaceId: task.workspaceId, taskId: task.taskId, actionId: parsed.value };
}

function taskLocator(task: TaskState) {
  return { workspaceId: task.workspaceId, taskId: task.taskId };
}

async function expectSuccess(result: Promise<{ status: ResultStatus }>): Promise<void> {
  expect((await result).status).toBe(ResultStatus.Success);
}
