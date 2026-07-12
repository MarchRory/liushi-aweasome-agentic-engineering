import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  ActorKind,
  CodingTaskAttemptOutcome,
  CodingTaskEventType,
  CODING_TASK_EVENT_SCHEMA_VERSION,
  HarnessError,
  HarnessErrorCode,
  FailureTaxonomy,
  ResultStatus,
  parseCodingTaskEventId,
  parseCodingTaskId,
  parseTaskId,
  parseWorkspaceId,
  type CodingTaskCreatedEventDraft,
} from "../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileCodingTaskRepository,
  FileParentDirectoryDurability,
  resolveCodingTaskStorePaths,
} from "../../src/infrastructure/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const workspaceId = unwrap(parseWorkspaceId("coding-task-persistence"));
const codingTaskId = unwrap(parseCodingTaskId("coding-task-1"));
const sourceTaskId = unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FB2"));
const otherWorkspaceId = unwrap(parseWorkspaceId("coding-task-other-workspace"));
const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("FileCodingTaskRepository", () => {
  it("创建后可完整 Replay，并拒绝重复创建和过期版本", async () => {
    const root = await runtimeStores.create("liushi-coding-task-");
    const repository = createRepository(root);
    const created = await repository.append({
      locator: { workspaceId, codingTaskId },
      expectedVersion: 0,
      event: createdEvent(),
    });
    expect(created).toMatchObject({
      status: ResultStatus.Success,
      value: { record: { aggregate: { version: 1 } } },
    });
    expect(
      await repository.append({
        locator: { workspaceId, codingTaskId },
        expectedVersion: 0,
        event: createdEvent("01ARZ3NDEKTSV4RRFFQ69G5FBA"),
      }),
    ).toMatchObject({ error: { code: HarnessErrorCode.CodingTaskAlreadyExists } });
    expect(await createRepository(root).load({ workspaceId, codingTaskId })).toMatchObject({
      value: { aggregate: { version: 1, runState: "active" }, lastSequence: 1 },
    });
  });

  it("不存在的 CodingTask 和非法首事件 fail closed", async () => {
    const root = await runtimeStores.create("liushi-coding-task-missing-");
    const repository = createRepository(root);
    expect(await repository.load({ workspaceId, codingTaskId })).toMatchObject({
      error: { code: HarnessErrorCode.CodingTaskNotFound },
    });
    const invalid = {
      ...createdEvent(),
      type: CodingTaskEventType.AttemptStarted,
      payload: { attemptNumber: 1 },
    } as never;
    expect(
      await repository.append({
        locator: { workspaceId, codingTaskId },
        expectedVersion: 0,
        event: invalid,
      }),
    ).toMatchObject({ error: { code: HarnessErrorCode.InvalidStateTransition } });
  });

  it("Hash Chain 损坏时拒绝加载", async () => {
    const root = await runtimeStores.create("liushi-coding-task-corrupt-");
    const repository = createRepository(root);
    await repository.append({
      locator: { workspaceId, codingTaskId },
      expectedVersion: 0,
      event: createdEvent(),
    });
    const paths = resolveCodingTaskStorePaths(root, workspaceId, codingTaskId);
    const content = await readFile(paths.eventsFile, "utf8");
    await writeFile(
      paths.eventsFile,
      content.replace(/"hash":"[a-f0-9]+"/, `"hash":"${"0".repeat(64)}"`),
      "utf8",
    );
    expect(await repository.load({ workspaceId, codingTaskId })).toMatchObject({
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("Event Log 缺少结尾换行时 fail closed", async () => {
    const root = await runtimeStores.create("liushi-coding-task-truncated-");
    const repository = createRepository(root);
    await repository.append({
      locator: { workspaceId, codingTaskId },
      expectedVersion: 0,
      event: createdEvent(),
    });
    const paths = resolveCodingTaskStorePaths(root, workspaceId, codingTaskId);
    const content = await readFile(paths.eventsFile, "utf8");
    await writeFile(paths.eventsFile, content.slice(0, -1), "utf8");
    expect(await repository.load({ workspaceId, codingTaskId })).toMatchObject({
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("不同 Workspace 的 Event Log 不能被 Replay 到当前目录", async () => {
    const root = await runtimeStores.create("liushi-coding-task-locator-");
    const repository = createRepository(root);
    await repository.append({
      locator: { workspaceId, codingTaskId },
      expectedVersion: 0,
      event: createdEvent(),
    });
    const source = resolveCodingTaskStorePaths(root, workspaceId, codingTaskId);
    const target = resolveCodingTaskStorePaths(root, otherWorkspaceId, codingTaskId);
    await mkdir(target.codingTaskDirectory, { recursive: true });
    await copyFile(source.eventsFile, target.eventsFile);
    expect(await repository.load({ workspaceId: otherWorkspaceId, codingTaskId })).toMatchObject({
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("候选事件的非法状态保留 InvalidStateTransition", async () => {
    const root = await runtimeStores.create("liushi-coding-task-candidate-");
    const repository = createRepository(root);
    await repository.append({
      locator: { workspaceId, codingTaskId },
      expectedVersion: 0,
      event: createdEvent(),
    });
    const invalid = {
      ...createdEvent("01ARZ3NDEKTSV4RRFFQ69G5FAW"),
      type: CodingTaskEventType.AttemptFinished,
      payload: {
        attemptNumber: 1,
        outcome: CodingTaskAttemptOutcome.Failed,
        failureTaxonomy: FailureTaxonomy.ImplementationDefect,
      },
    } as never;
    expect(
      await repository.append({
        locator: { workspaceId, codingTaskId },
        expectedVersion: 1,
        event: invalid,
      }),
    ).toMatchObject({ error: { code: HarnessErrorCode.InvalidStateTransition } });
  });

  it("锁争用返回 LockUnavailable 而不是 OutcomeUnknown", async () => {
    const root = await runtimeStores.create("liushi-coding-task-lock-");
    const repository = new FileCodingTaskRepository(root, {
      lockManager: {
        acquire: () =>
          Promise.reject(new HarnessError(HarnessErrorCode.LockUnavailable, "测试锁已被占用。")),
      },
      parentDirectoryDurability: new FileParentDirectoryDurability(),
    });
    expect(
      await repository.append({
        locator: { workspaceId, codingTaskId },
        expectedVersion: 0,
        event: createdEvent(),
      }),
    ).toMatchObject({ error: { code: HarnessErrorCode.LockUnavailable } });
  });

  it("提交前释放锁失败不会伪装成 OutcomeUnknown", async () => {
    const root = await runtimeStores.create("liushi-coding-task-release-");
    const repository = new FileCodingTaskRepository(root, {
      lockManager: {
        acquire: () =>
          Promise.resolve({
            release: () => Promise.reject(new Error("测试锁释放失败。")),
          }),
      },
      parentDirectoryDurability: new FileParentDirectoryDurability(),
    });
    const invalid = {
      ...createdEvent(),
      type: CodingTaskEventType.AttemptStarted,
      payload: { attemptNumber: 1 },
    } as never;
    expect(
      await repository.append({
        locator: { workspaceId, codingTaskId },
        expectedVersion: 0,
        event: invalid,
      }),
    ).toMatchObject({ error: { code: HarnessErrorCode.LockUnavailable } });
  });
});

function createRepository(root: string): FileCodingTaskRepository {
  return new FileCodingTaskRepository(root, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
}

function createdEvent(eventId = "01ARZ3NDEKTSV4RRFFQ69G5FAV"): CodingTaskCreatedEventDraft {
  return {
    schemaVersion: CODING_TASK_EVENT_SCHEMA_VERSION,
    eventId: unwrap(parseCodingTaskEventId(eventId)),
    codingTaskId,
    workspaceId,
    type: CodingTaskEventType.CodingTaskCreated,
    commandId: "create-coding-task",
    correlationId: "coding-task-correlation",
    occurredAt: "2026-07-12T00:00:00.000Z",
    actor: { kind: ActorKind.Human, actorId: "human" },
    payload: {
      sourceTaskId,
      repositoryId: "repo-1",
      baseRevision: "main",
      worktreeBinding: {
        worktreeId: "wt-1",
        relativePath: "src",
        branchName: "feature/coding-task",
        managed: true,
      },
      writeSet: ["src"],
      inputBindingSet: { bindings: [] },
      executionAuthorization: {
        planRisk: {
          artifactId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          artifactDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
          result: "allow",
          requiredGates: ["G1"],
          satisfiedApprovalIds: ["01ARZ3NDEKTSV4RRFFQ69G5FAV"],
        },
        historicalLogicChange: false,
      },
    },
  } as unknown as CodingTaskCreatedEventDraft;
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "解析测试 fixture 失败。");
  }
  return result.value;
}
