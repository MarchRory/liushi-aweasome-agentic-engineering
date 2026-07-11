import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ActorKind,
  ArtifactStatus,
  ArtifactType,
  HarnessErrorCode,
  LockReleaseStatus,
  ParentDirectorySyncStatus,
  PersistenceHealth,
  ProposeArtifactUseCase,
  ResultStatus,
  SnapshotPersistenceStatus,
  createHarnessApplication,
  createInitialTaskState,
  parseTaskId,
  parseWorkspaceId,
  type IdGenerator,
  type PersistedTaskSnapshot,
  type TaskState,
} from "../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileSnapshotStore,
  FileTaskRepository,
  Rfc8785Sha256DigestAdapter,
  type ExclusiveFileLockHandle,
  type FileLockManager,
  type ParentDirectoryDurability,
  type ParentDirectorySyncOutcome,
  type SnapshotStore,
  type TaskLockContext,
} from "../../src/infrastructure/index.js";
import {
  FixedClock,
  FixedSequenceIdGenerator,
  TemporaryRuntimeStore,
} from "../support/runtime/index.js";

const TASK_ID_A = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TASK_ID_B = "01ARZ3NDEKTSV4RRFFQ69G5FAX";
const EVENT_ID_A = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const EVENT_ID_B = "01ARZ3NDEKTSV4RRFFQ69G5FAY";
const ARTIFACT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB0";
const DECISION_REQUEST_ID = "01ARZ3NDEKTSV4RRFFQ69G5FC0";
const WORKSPACE_ID_A = "workspace-a";
const WORKSPACE_ID_B = "workspace-b";
const CREATED_AT = "2026-07-11T00:00:00.000Z";
const ACTOR = { kind: ActorKind.Human, actorId: "tester" };
const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("Task persistence resilience", () => {
  it("Snapshot 写入失败时 Event 仍成功提交并可重放", async () => {
    const storeRoot = await runtimeStores.create("liushi-snapshot-failure-");
    const repository = createRepository(storeRoot, {
      snapshotStore: new FailingSnapshotStore(),
    });
    const task = makeTask(TASK_ID_A, WORKSPACE_ID_A);

    const created = await repository.create(task);

    expect(created.status).toBe(ResultStatus.Success);
    if (created.status === ResultStatus.Success) {
      expect(created.value.task).toEqual(task);
      expect(created.value.persistence).toMatchObject({
        overall: PersistenceHealth.Degraded,
        snapshot: SnapshotPersistenceStatus.RebuildRequired,
      });
      expect(created.value.persistence.recoveryPaths).toEqual([
        snapshotFile(storeRoot, WORKSPACE_ID_A, TASK_ID_A),
      ]);
    }

    const loaded = await repository.get({
      workspaceId: parseWorkspace(WORKSPACE_ID_A),
      taskId: parseTask(TASK_ID_A),
    });
    expect(loaded).toEqual({ status: ResultStatus.Success, value: task });
  });

  it("append 后 Snapshot 写入失败时返回 degraded success，重启按合法旧前缀重放", async () => {
    const storeRoot = await runtimeStores.create("liushi-append-snapshot-failure-");
    const snapshotStore = new FailAfterFirstSnapshotWriteStore();
    const repository = createRepository(storeRoot, {
      snapshotStore,
      eventIdGenerator: new FixedSequenceIdGenerator([EVENT_ID_A, EVENT_ID_B]),
    });
    const created = await repository.create(makeTask(TASK_ID_A, WORKSPACE_ID_A));
    expect(created.status).toBe(ResultStatus.Success);
    const proposeArtifact = new ProposeArtifactUseCase(
      repository,
      new Rfc8785Sha256DigestAdapter(),
      new FixedClock(CREATED_AT),
      new FixedSequenceIdGenerator([ARTIFACT_ID]),
      new FixedSequenceIdGenerator([DECISION_REQUEST_ID]),
    );

    const proposed = await proposeArtifact.execute({
      workspaceId: WORKSPACE_ID_A,
      taskId: TASK_ID_A,
      actor: ACTOR,
      proposal: requirementProposal(),
    });

    expect(proposed.status).toBe(ResultStatus.Success);
    if (proposed.status === ResultStatus.Success) {
      expect(proposed.value.persistence).toMatchObject({
        overall: PersistenceHealth.Degraded,
        snapshot: SnapshotPersistenceStatus.RebuildRequired,
      });
    }

    const replayed = await createRepository(storeRoot).load({
      workspaceId: parseWorkspace(WORKSPACE_ID_A),
      taskId: parseTask(TASK_ID_A),
    });
    expect(replayed.status).toBe(ResultStatus.Success);
    if (replayed.status === ResultStatus.Success) {
      expect(replayed.value.lastSequence).toBe(2);
      expect(replayed.value.aggregate.artifacts).toHaveLength(1);
      expect(replayed.value.aggregate.pendingDecision?.decisionRequestId).toBe(DECISION_REQUEST_ID);
    }
  });

  it.each([
    [LockFailureTarget.Task, LockReleaseStatus.RecoveryRequired, LockReleaseStatus.Released],
    [LockFailureTarget.Workspace, LockReleaseStatus.Released, LockReleaseStatus.RecoveryRequired],
  ])("%s lock 在提交后释放失败时返回 degraded success", async (target, taskLock, workspaceLock) => {
    const storeRoot = await runtimeStores.create("liushi-lock-release-failure-");
    const repository = createRepository(storeRoot, {
      lockManager: new ReleaseFailureLockManager(target),
    });

    const created = await repository.create(makeTask(TASK_ID_A, WORKSPACE_ID_A));

    expect(created.status).toBe(ResultStatus.Success);
    if (created.status === ResultStatus.Success) {
      expect(created.value.persistence.overall).toBe(PersistenceHealth.Degraded);
      expect(created.value.persistence.taskLock).toBe(taskLock);
      expect(created.value.persistence.workspaceLock).toBe(workspaceLock);
      expect(created.value.persistence.recoveryPaths).toHaveLength(1);
    }
  });

  it("目录 fsync 不受平台支持时明确返回 best-effort degraded", async () => {
    const storeRoot = await runtimeStores.create("liushi-directory-durability-");
    const repository = createRepository(storeRoot, {
      parentDirectoryDurability: new FixedParentDirectoryDurability(
        ParentDirectorySyncStatus.BestEffort,
      ),
    });

    const created = await repository.create(makeTask(TASK_ID_A, WORKSPACE_ID_A));

    expect(created.status).toBe(ResultStatus.Success);
    if (created.status === ResultStatus.Success) {
      expect(created.value.persistence).toMatchObject({
        overall: PersistenceHealth.Degraded,
        eventDirectory: ParentDirectorySyncStatus.BestEffort,
        snapshotDirectory: ParentDirectorySyncStatus.BestEffort,
      });
    }
  });

  it("同一 Workspace 顺序创建不同 Task 时第二个返回 WorkspaceBusy", async () => {
    const storeRoot = await runtimeStores.create("liushi-workspace-sequential-");
    const app = createHarnessApplication({
      storeRoot,
      clock: new FixedClock(CREATED_AT),
      taskIdGenerator: new FixedSequenceIdGenerator([TASK_ID_A, TASK_ID_B]),
      eventIdGenerator: new FixedSequenceIdGenerator([EVENT_ID_A]),
    });

    const first = await app.createTask.execute({ workspaceId: WORKSPACE_ID_A, actor: ACTOR });
    const second = await app.createTask.execute({ workspaceId: WORKSPACE_ID_A, actor: ACTOR });

    expect(first.status).toBe(ResultStatus.Success);
    expect(second.status).toBe(ResultStatus.Failure);
    if (second.status === ResultStatus.Failure) {
      expect(second.error.code).toBe(HarnessErrorCode.WorkspaceBusy);
    }
  });

  it("同一 Workspace 并发创建时只有一个 Task 提交", async () => {
    const storeRoot = await runtimeStores.create("liushi-workspace-concurrent-");
    const app = createHarnessApplication({
      storeRoot,
      clock: new FixedClock(CREATED_AT),
      taskIdGenerator: new FixedSequenceIdGenerator([TASK_ID_A, TASK_ID_B]),
      eventIdGenerator: new FixedSequenceIdGenerator([EVENT_ID_A]),
    });

    const results = await Promise.all([
      app.createTask.execute({ workspaceId: WORKSPACE_ID_A, actor: ACTOR }),
      app.createTask.execute({ workspaceId: WORKSPACE_ID_A, actor: ACTOR }),
    ]);

    expect(results.filter((result) => result.status === ResultStatus.Success)).toHaveLength(1);
    const failure = results.find((result) => result.status === ResultStatus.Failure);
    expect(failure?.status).toBe(ResultStatus.Failure);
    if (failure?.status === ResultStatus.Failure) {
      expect([HarnessErrorCode.LockUnavailable, HarnessErrorCode.WorkspaceBusy]).toContain(
        failure.error.code,
      );
    }
  });

  it("不同 Workspace 可以并发创建 Task", async () => {
    const storeRoot = await runtimeStores.create("liushi-workspace-independent-");
    const app = createHarnessApplication({
      storeRoot,
      clock: new FixedClock(CREATED_AT),
      taskIdGenerator: new FixedSequenceIdGenerator([TASK_ID_A, TASK_ID_B]),
      eventIdGenerator: new FixedSequenceIdGenerator([EVENT_ID_A, EVENT_ID_B]),
    });

    const results = await Promise.all([
      app.createTask.execute({ workspaceId: WORKSPACE_ID_A, actor: ACTOR }),
      app.createTask.execute({ workspaceId: WORKSPACE_ID_B, actor: ACTOR }),
    ]);

    expect(results.every((result) => result.status === ResultStatus.Success)).toBe(true);
  });
});

/** 注入 FileTaskRepository 的可选故障点。 */
interface RepositoryOverrides {
  /** 替换 Event ID Generator。 */
  eventIdGenerator?: IdGenerator;
  /** 替换 Snapshot Store。 */
  snapshotStore?: SnapshotStore;
  /** 替换 Lock Manager。 */
  lockManager?: FileLockManager;
  /** 替换目录耐久性 Adapter。 */
  parentDirectoryDurability?: ParentDirectoryDurability;
}

function createRepository(
  storeRoot: string,
  overrides: RepositoryOverrides = {},
): FileTaskRepository {
  return new FileTaskRepository(storeRoot, {
    eventIdGenerator: overrides.eventIdGenerator ?? new FixedSequenceIdGenerator([EVENT_ID_A]),
    snapshotStore: overrides.snapshotStore ?? new FileSnapshotStore(),
    lockManager: overrides.lockManager ?? new ExclusiveFileLockManager(),
    parentDirectoryDurability:
      overrides.parentDirectoryDurability ??
      new FixedParentDirectoryDurability(ParentDirectorySyncStatus.Synced),
  });
}

function makeTask(taskId: string, workspaceId: string): TaskState {
  return createInitialTaskState({
    taskId: parseTask(taskId),
    workspaceId: parseWorkspace(workspaceId),
    actor: ACTOR,
    occurredAt: CREATED_AT,
  });
}

function parseTask(value: string) {
  const result = parseTaskId(value);
  if (result.status === ResultStatus.Failure) {
    throw result.error;
  }
  return result.value;
}

function parseWorkspace(value: string) {
  const result = parseWorkspaceId(value);
  if (result.status === ResultStatus.Failure) {
    throw result.error;
  }
  return result.value;
}

function snapshotFile(storeRoot: string, workspaceId: string, taskId: string): string {
  return resolve(storeRoot, "workspaces", workspaceId, "tasks", taskId, "snapshot.json");
}

function requirementProposal(): object {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "Preserve replay after an append snapshot failure.",
      goals: ["Keep the event log authoritative."],
      nonGoals: ["Repair the snapshot in the same request."],
      observableBehaviors: ["Restart replays the committed Artifact."],
      acceptanceCriteria: ["A stale valid snapshot prefix does not fail replay."],
      includedScopes: ["packages/liushi-harness"],
      forbiddenScopes: ["unrelated packages"],
      repositories: ["liushi-aweasome-agentic-engineering"],
      edgeCases: ["snapshot write failure after event fsync"],
      compatibilityConstraints: ["legacy TaskCreated snapshot remains readable"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

/** 始终拒绝 Snapshot 写入的故障注入 Adapter。 */
class FailingSnapshotStore implements SnapshotStore {
  public write(): Promise<void> {
    return Promise.reject(new Error("Injected Snapshot write failure."));
  }

  public read(): Promise<never> {
    return Promise.reject(new Error("Snapshot read must not be called."));
  }
}

/** 首次写入真实 Snapshot，之后注入写入失败并保留合法旧前缀。 */
class FailAfterFirstSnapshotWriteStore implements SnapshotStore {
  private readonly delegate = new FileSnapshotStore();
  private writes = 0;

  public write(snapshotFilePath: string, snapshot: PersistedTaskSnapshot): Promise<void> {
    this.writes += 1;
    return this.writes === 1
      ? this.delegate.write(snapshotFilePath, snapshot)
      : Promise.reject(new Error("Injected append Snapshot write failure."));
  }

  public read(snapshotFilePath: string): Promise<PersistedTaskSnapshot> {
    return this.delegate.read(snapshotFilePath);
  }
}

/** 测试要注入释放失败的 Lock 层级。 */
enum LockFailureTarget {
  /** Task lock。 */
  Task = "task",
  /** Workspace task-creation lock。 */
  Workspace = "workspace",
}

/** 在真实 Lock 已清理后报告释放失败，模拟 post-commit 异常。 */
class ReleaseFailureLockManager implements FileLockManager {
  private readonly delegate = new ExclusiveFileLockManager();

  public constructor(private readonly target: LockFailureTarget) {}

  public async acquire(
    lockFile: string,
    context: TaskLockContext,
  ): Promise<ExclusiveFileLockHandle> {
    const handle = await this.delegate.acquire(lockFile, context);
    const shouldFail =
      (this.target === LockFailureTarget.Task && context.taskId !== undefined) ||
      (this.target === LockFailureTarget.Workspace && context.taskId === undefined);

    return {
      release: async (): Promise<void> => {
        await handle.release();
        if (shouldFail) {
          throw new Error(`Injected ${this.target} lock release failure.`);
        }
      },
    };
  }
}

/** 为测试固定返回目录 fsync 状态的 Adapter。 */
class FixedParentDirectoryDurability implements ParentDirectoryDurability {
  public constructor(private readonly status: ParentDirectorySyncStatus) {}

  public syncParentDirectory(): Promise<ParentDirectorySyncOutcome> {
    return Promise.resolve({ status: this.status });
  }
}
