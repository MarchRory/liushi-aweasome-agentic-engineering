import { describe, expect, it } from "vitest";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "../../src/common/index.js";
import { ActionOutcome } from "../../src/domain/actionJournal/index.js";
import {
  CodingTaskSessionChangeKind,
  createCodingTaskSessionChangeSet,
  createCodingTaskSessionChangeSetSnapshot,
  type CodingTaskSessionChangeSet,
  type CodingTaskSessionChangeSetSnapshot,
} from "../../src/domain/codingTaskSessionChangeSet/index.js";
import { parseRepositoryId } from "../../src/domain/workspace/index.js";
import {
  ChangeSetCheckpointRecoveryStatus,
  ChangeSetCheckpointService,
  type ChangeSetCheckpointInput,
} from "../../src/application/changeSetCheckpoint/index.js";
import {
  GitCheckpointInspectionStatus,
  type GitCheckpoint,
  type GitCheckpointInspection,
  type GitChangeSetInspectorPort,
  type GitCheckpointRecoveryPort,
  type GitCommittedChangeSetInspectorPort,
} from "../../src/application/ports/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const repositoryId = requireValue(parseRepositoryId("change-set-checkpoint-recovery-test"));
const baseRevision = "a".repeat(40);
const targetRevision = "b".repeat(40);

describe("ChangeSetCheckpointService recovery assessment", () => {
  it("底层明确 Absent 时返回 Absent 且保持只读", async () => {
    const harness = createHarness({ state: RecoveryState.Absent });
    const result = await harness.service.assess(harness.input);

    expect(result).toEqual(success({ status: ChangeSetCheckpointRecoveryStatus.Absent }));
    expect(harness.calls.inspect).toBe(0);
    expectReadOnly(harness.calls);
  });

  it.each([
    ["底层 Unknown", { state: RecoveryState.Unknown }],
    ["底层 failure", { state: RecoveryState.Failure }],
    ["底层抛出异常", { state: RecoveryState.Throw }],
    ["底层非法运行时状态", { state: RecoveryState.Invalid }],
  ])("%s 时返回 Unknown 且保持只读", async (_name, options) => {
    const harness = createHarness(options);
    const result = await harness.service.assess(harness.input);

    expect(result).toEqual(success({ status: ChangeSetCheckpointRecoveryStatus.Unknown }));
    expect(harness.calls.inspect).toBe(0);
    expectReadOnly(harness.calls);
  });

  it("底层 Present 且现有 inspect 完整复验成功时携带完整 Checkpoint", async () => {
    const harness = createHarness({ state: RecoveryState.Present });
    const result = await harness.service.assess(harness.input);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status !== ResultStatus.Success) throw new Error("恢复评估未返回成功结果。");
    expect(result.value.status).toBe(ChangeSetCheckpointRecoveryStatus.Present);
    if (result.value.status !== ChangeSetCheckpointRecoveryStatus.Present) {
      throw new Error("恢复评估未返回 Present 判别分支。");
    }
    expect(result.value.checkpoint).toMatchObject({
      checkpoint: { targetRevision, changedPaths: harness.snapshot.changedPaths },
      changeSetDigest: harness.snapshot.changeSetDigest,
      preSubmitSnapshotDigest: harness.snapshot.snapshotDigest,
    });
    expect(harness.calls.inspect).toBe(1);
    expect(harness.calls.committed).toBe(1);
    expectReadOnly(harness.calls);
  });

  it("底层 Present 但现有 inspect 复验不匹配时返回 Unknown", async () => {
    const harness = createHarness({
      state: RecoveryState.Present,
      committedChangeSetDigest: digestOf({ mismatch: true }),
    });
    const result = await harness.service.assess(harness.input);

    expect(result).toEqual(success({ status: ChangeSetCheckpointRecoveryStatus.Unknown }));
    expect(harness.calls.inspect).toBe(1);
    expect(harness.calls.committed).toBe(1);
    expectReadOnly(harness.calls);
  });

  it("输入无效时返回 failure 且不调用任何底层检查或副作用", async () => {
    const harness = createHarness({ state: RecoveryState.Present });
    const result = await harness.service.assess({
      ...harness.input,
      checkpointInput: {
        ...harness.input.checkpointInput,
        worktreeBinding: { ...harness.input.checkpointInput.worktreeBinding, managed: false },
      },
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
    expect(harness.calls.assess).toBe(0);
    expect(harness.calls.inspect).toBe(0);
    expect(harness.calls.committed).toBe(0);
    expectReadOnly(harness.calls);
  });
});

/** 测试用的底层 Recovery Assessment 结果分支。 */
enum RecoveryState {
  /** 底层明确不存在 Checkpoint。 */
  Absent = "absent",
  /** 底层无法证明 Checkpoint 状态。 */
  Unknown = "unknown",
  /** 底层发现 Checkpoint，交由上层完整复验。 */
  Present = "present",
  /** 底层以 failure 返回。 */
  Failure = "failure",
  /** 底层抛出异常。 */
  Throw = "throw",
  /** 底层返回不属于封闭枚举的运行时脏值。 */
  Invalid = "invalid",
}

/** 测试用的服务配置。 */
interface HarnessOptions {
  readonly state?: RecoveryState;
  readonly committedChangeSetDigest?: ContentDigest;
}

/** 测试用的服务、输入与调用计数。 */
interface Harness {
  readonly service: ChangeSetCheckpointService;
  readonly input: ChangeSetCheckpointInput;
  readonly snapshot: CodingTaskSessionChangeSetSnapshot;
  readonly calls: {
    assess: number;
    inspect: number;
    preSubmit: number;
    committed: number;
    execute: number;
  };
}

function createHarness(options: HarnessOptions = {}): Harness {
  const snapshot = createSnapshot();
  const checkpoint: GitCheckpoint = {
    targetRevision,
    changedPaths: snapshot.changedPaths,
    checkpointDigest: digestOf({ targetRevision, changedPaths: snapshot.changedPaths }),
  };
  const calls = { assess: 0, inspect: 0, preSubmit: 0, committed: 0, execute: 0 };
  const state = options.state ?? RecoveryState.Present;
  const committedChangeSetInspector: GitCommittedChangeSetInspectorPort = {
    inspectCommitted: () => {
      calls.committed += 1;
      return Promise.resolve(
        success({
          ...createChangeSet(),
          changeSetDigest: options.committedChangeSetDigest ?? snapshot.changeSetDigest,
        }),
      );
    },
  };
  const changeSetInspector: GitChangeSetInspectorPort = {
    inspectPreSubmit: () => {
      calls.preSubmit += 1;
      return Promise.resolve(success(snapshot));
    },
  };
  const gitCheckpoint: GitCheckpointRecoveryPort = {
    assess: () => {
      calls.assess += 1;
      if (state === RecoveryState.Throw) return Promise.reject(new Error("底层检查异常"));
      if (state === RecoveryState.Failure) {
        return Promise.resolve(
          failure(new HarnessError(HarnessErrorCode.IoFailure, "底层检查失败。")),
        );
      }
      if (state === RecoveryState.Absent) {
        return Promise.resolve(success({ status: GitCheckpointInspectionStatus.Absent }));
      }
      if (state === RecoveryState.Unknown) {
        return Promise.resolve(success({ status: GitCheckpointInspectionStatus.Unknown }));
      }
      if (state === RecoveryState.Invalid) {
        return Promise.resolve(
          success({ status: "invalid" } as unknown as GitCheckpointInspection),
        );
      }
      return Promise.resolve(
        success({ status: GitCheckpointInspectionStatus.Present, checkpoint }),
      );
    },
    inspect: () => {
      calls.inspect += 1;
      return Promise.resolve(success(checkpoint));
    },
    execute: () => {
      calls.execute += 1;
      return Promise.resolve(success({ outcome: ActionOutcome.Succeeded, evidenceIds: [] }));
    },
  };
  const input: ChangeSetCheckpointInput = {
    checkpointInput: {
      repositoryId,
      repositoryRoot: "D:/repo",
      worktreeBinding: {
        worktreeId: snapshot.worktreeId,
        relativePath: snapshot.worktreeRelativePath,
        branchName: snapshot.branchName,
        managed: true,
      },
      baseRevision,
      writeSet: snapshot.writeSet,
      commitMessage: "chore: checkpoint",
    },
    preSubmitSnapshot: snapshot,
  };
  return {
    service: new ChangeSetCheckpointService(
      changeSetInspector,
      committedChangeSetInspector,
      gitCheckpoint,
      digest,
    ),
    input,
    snapshot,
    calls,
  };
}

function createSnapshot(): CodingTaskSessionChangeSetSnapshot {
  return requireValue(
    createCodingTaskSessionChangeSetSnapshot(
      {
        changeSet: createChangeSet(),
        worktreeId: "worktree-1",
        worktreeRelativePath: "worktrees/task",
        branchName: "feature/task",
        observedHeadRevision: baseRevision,
        writeSet: ["src/changed.ts"],
      },
      digest,
    ),
  );
}

function createChangeSet(): CodingTaskSessionChangeSet {
  return requireValue(
    createCodingTaskSessionChangeSet(
      {
        repositoryId,
        baseRevision,
        changes: [
          {
            path: "src/changed.ts",
            kind: CodingTaskSessionChangeKind.Modified,
            targetContentDigest: digestOf({ content: "changed" }),
          },
        ],
      },
      digest,
    ),
  );
}

function digestOf(input: unknown): ContentDigest {
  return requireValue(digest.calculate(input));
}

function expectReadOnly(calls: Harness["calls"]): void {
  expect(calls.execute).toBe(0);
  expect(calls.preSubmit).toBe(0);
}

function requireValue<T>(result: Result<T, unknown>): T {
  if (result.status !== ResultStatus.Success) throw new Error(String(result.error));
  return result.value;
}
