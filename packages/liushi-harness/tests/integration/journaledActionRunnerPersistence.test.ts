import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { JournaledActionDisposition, JournaledActionRunner } from "../../src/application/index.js";
import { ActorKind, ResultStatus, parseContentDigest, success } from "../../src/common/index.js";
import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionJournalStatus,
  ActionKind,
  ActionOutcome,
  parseActionId,
  type ActionIntentRecord,
} from "../../src/domain/actionJournal/index.js";
import { parseTaskId } from "../../src/domain/task/index.js";
import { parseWorkspaceId } from "../../src/domain/workspace/index.js";
import {
  ExclusiveFileLockManager,
  FileActionExecutionLockAdapter,
  FileActionJournalRepository,
  FileParentDirectoryDurability,
} from "../../src/infrastructure/index.js";
import { createHarnessApplication } from "../../src/index.js";
import { FixedClock, FixedSequenceIdGenerator } from "../support/runtime/index.js";

const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const FIXED_TIME = "2026-07-12T00:00:00.000Z";
const stores: string[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => rm(store, { recursive: true, force: true })));
});

describe("JournaledActionRunner persistence", () => {
  it("跨实例重放完成态且不重复调用 Executor", async () => {
    const storeRoot = await createStore();
    await createTaskFixture(storeRoot);

    const intent = createIntent();
    let calls = 0;
    const executor = {
      execute: () => {
        calls += 1;
        return Promise.resolve(
          success({ outcome: ActionOutcome.Succeeded, evidenceIds: ["evidence-1"] }),
        );
      },
    };
    const first = await createRunner(storeRoot).execute(
      { intent, executionInput: undefined },
      executor,
    );
    const duplicate = await createRunner(storeRoot).execute(
      { intent, executionInput: undefined },
      executor,
    );

    expect(first.status).toBe(ResultStatus.Success);
    expect(duplicate.status).toBe(ResultStatus.Success);
    if (first.status === ResultStatus.Success && duplicate.status === ResultStatus.Success) {
      expect(first.value.state.status).toBe(ActionJournalStatus.Committed);
      expect(first.value.disposition).toBe(JournaledActionDisposition.Executed);
      expect(duplicate.value.disposition).toBe(JournaledActionDisposition.ReusedCompleted);
    }
    expect(calls).toBe(1);
  });

  it("Action 执行锁阻止两个进程同时消费 RetryPermitted", async () => {
    const storeRoot = await createStore();
    await createTaskFixture(storeRoot);
    const intent = createIntent();
    const prepared = await createRunner(storeRoot).execute(
      { intent, executionInput: undefined },
      {
        execute: () =>
          Promise.resolve(
            success({ outcome: ActionOutcome.NotApplied, evidenceIds: ["not-applied"] }),
          ),
      },
    );
    expect(prepared.status).toBe(ResultStatus.Success);

    let releaseExecution: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const executionGate = new Promise<void>((resolve) => {
      releaseExecution = resolve;
    });
    let retryCalls = 0;
    const retryExecutor = {
      execute: async () => {
        retryCalls += 1;
        markStarted?.();
        await executionGate;
        return success({ outcome: ActionOutcome.Succeeded, evidenceIds: ["retry-success"] });
      },
    };
    const first = createRunner(storeRoot).execute(
      { intent, executionInput: undefined },
      retryExecutor,
    );
    await started;
    const competing = await createRunner(storeRoot).execute(
      { intent, executionInput: undefined },
      retryExecutor,
    );
    releaseExecution?.();
    const completed = await first;

    expect(completed.status).toBe(ResultStatus.Success);
    expect(competing.status).toBe(ResultStatus.Failure);
    if (competing.status === ResultStatus.Failure) {
      expect(competing.error.code).toBe("lock_unavailable");
      expect(competing.error.details).not.toHaveProperty("lockFile");
    }
    expect(retryCalls).toBe(1);
  });
});

function createRunner(storeRoot: string): JournaledActionRunner {
  return new JournaledActionRunner(
    new FileActionJournalRepository(storeRoot, {
      lockManager: new ExclusiveFileLockManager(),
      parentDirectoryDurability: new FileParentDirectoryDurability(),
    }),
    new FixedClock(FIXED_TIME),
    new FileActionExecutionLockAdapter(storeRoot, new ExclusiveFileLockManager()),
  );
}

function createIntent(): ActionIntentRecord {
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Intent,
    actionId: must(parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FAV")),
    sequence: 1,
    workspaceId: must(parseWorkspaceId("workspace-a")),
    taskId: must(parseTaskId(TASK_ID)),
    commandId: "command-1",
    correlationId: "correlation-1",
    idempotencyKey: "idempotency-1",
    kind: ActionKind.CommandExecution,
    target: "persistent-action",
    inputDigest: must(
      parseContentDigest("sha256:1111111111111111111111111111111111111111111111111111111111111111"),
    ),
    postconditionDigest: must(
      parseContentDigest("sha256:2222222222222222222222222222222222222222222222222222222222222222"),
    ),
    recoveryGuidance: "检查后置条件后由 Human 决定恢复动作。",
    actor: { kind: ActorKind.System, actorId: "journaled-action-runner" },
    recordedAt: FIXED_TIME,
  };
}

async function createStore(): Promise<string> {
  const store = await mkdtemp(join(tmpdir(), "liushi-journaled-action-"));
  stores.push(store);
  return store;
}

async function createTaskFixture(storeRoot: string): Promise<void> {
  const created = await createHarnessApplication({
    storeRoot,
    clock: new FixedClock(FIXED_TIME),
    taskIdGenerator: new FixedSequenceIdGenerator([TASK_ID]),
    eventIdGenerator: new FixedSequenceIdGenerator(["01ARZ3NDEKTSV4RRFFQ69G5FAX"]),
  }).createTask.execute({
    workspaceId: "workspace-a",
    actor: { kind: ActorKind.Human, actorId: "tester" },
  });
  expect(created.status).toBe(ResultStatus.Success);
}

function must<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status === ResultStatus.Failure || result.value === undefined) {
    throw result.error ?? new Error("fixture parse failed");
  }
  return result.value;
}
