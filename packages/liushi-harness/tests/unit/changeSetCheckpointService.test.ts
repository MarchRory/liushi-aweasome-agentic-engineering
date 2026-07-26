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
  ChangeSetCheckpointErrorCode,
  ChangeSetCheckpointService,
  type ChangeSetCheckpointInput,
} from "../../src/application/changeSetCheckpoint/index.js";
import {
  GitCheckpointInspectionStatus,
  type GitCheckpoint,
  type GitCheckpointExecutionResult,
  type GitChangeSetInspectorPort,
  type GitCheckpointRecoveryPort,
  type GitCommittedChangeSetInspectorPort,
} from "../../src/application/ports/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const repositoryId = requireValue(parseRepositoryId("change-set-checkpoint-test"));
const baseRevision = "a".repeat(40);
const targetRevision = "b".repeat(40);

describe("ChangeSetCheckpointService", () => {
  it("在现场和提交后 ChangeSet 均匹配时创建绑定结果", async () => {
    const harness = createHarness();
    const result = await harness.service.execute(harness.input);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        outcome: ActionOutcome.Succeeded,
        evidenceIds: [
          `git:${targetRevision}`,
          `changeset:${harness.snapshot.changeSetDigest}`,
          `snapshot:${harness.snapshot.snapshotDigest}`,
        ],
      },
    });
    if (result.status !== ResultStatus.Success) throw new Error("正向执行未返回成功结果。");
    expect(result.value.outputDigest).toBeDefined();
    expect(harness.calls.execute).toBe(1);
    expect(harness.calls.committed).toBe(1);
  });

  it("pre-submit Snapshot 漂移时不产生 generic execute 副作用", async () => {
    const harness = createHarness({ preSubmitSnapshot: createSnapshot("drifted") });
    const result = await harness.service.execute(harness.input);

    expect(result).toEqual(
      success({
        outcome: ActionOutcome.NotApplied,
        evidenceIds: [],
        errorCode: ChangeSetCheckpointErrorCode.PreSubmitDrift,
      }),
    );
    expect(harness.calls.execute).toBe(0);
  });

  it("pre-submit Inspector 返回损坏 Snapshot 时结果未知且不执行副作用", async () => {
    const snapshot = createSnapshot("drifted");
    const harness = createHarness({
      preSubmitSnapshot: { ...snapshot, snapshotDigest: digestOf({ invalid: true }) },
    });
    const result = await harness.service.execute(harness.input);

    expect(result).toEqual(
      success({
        outcome: ActionOutcome.OutcomeUnknown,
        evidenceIds: [],
        errorCode: ChangeSetCheckpointErrorCode.PreSubmitDrift,
      }),
    );
    expect(harness.calls.execute).toBe(0);
  });

  it("提交后绑定不匹配时返回 OutcomeUnknown", async () => {
    const harness = createHarness({ committedChangeSetDigest: digestOf({ committed: "drift" }) });
    const result = await harness.service.execute(harness.input);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        outcome: ActionOutcome.OutcomeUnknown,
        errorCode: ChangeSetCheckpointErrorCode.PostconditionUnknown,
      },
    });
    expect(harness.calls.execute).toBe(1);
  });

  it("已有匹配 Checkpoint 时幂等恢复且不再次 execute", async () => {
    const harness = createHarness({ existingCheckpoint: true });
    const result = await harness.service.execute(harness.input);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { outcome: ActionOutcome.Succeeded },
    });
    expect(harness.calls.execute).toBe(0);
    expect(harness.calls.committed).toBe(1);
  });

  it("Checkpoint 存在性未知时禁止继续副作用", async () => {
    const harness = createHarness({ checkpointInspectionUnknown: true });
    const result = await harness.service.execute(harness.input);

    expect(result).toEqual(
      success({
        outcome: ActionOutcome.OutcomeUnknown,
        evidenceIds: [],
        errorCode: ChangeSetCheckpointErrorCode.ExistingCheckpointMismatch,
      }),
    );
    expect(harness.calls.preSubmit).toBe(0);
    expect(harness.calls.execute).toBe(0);
  });

  it.each([
    [
      "身份篡改",
      (input: ChangeSetCheckpointInput) => ({
        ...input,
        preSubmitSnapshot: { ...input.preSubmitSnapshot, branchName: "tampered/branch" },
      }),
    ],
    [
      "摘要篡改",
      (input: ChangeSetCheckpointInput) => ({
        ...input,
        preSubmitSnapshot: {
          ...input.preSubmitSnapshot,
          snapshotDigest: digestOf({ tampered: true }),
        },
      }),
    ],
    [
      "非受管 Worktree",
      (input: ChangeSetCheckpointInput) => ({
        ...input,
        checkpointInput: {
          ...input.checkpointInput,
          worktreeBinding: { ...input.checkpointInput.worktreeBinding, managed: false },
        },
      }),
    ],
  ])("%s 时 fail closed 且不产生副作用", async (_name, mutate) => {
    const harness = createHarness();
    const result = await harness.service.execute(mutate(harness.input));

    expect(result).toEqual(
      success({
        outcome: ActionOutcome.NotApplied,
        evidenceIds: [],
        errorCode: ChangeSetCheckpointErrorCode.InputInvalid,
      }),
    );
    expect(harness.calls.assess).toBe(0);
    expect(harness.calls.inspect).toBe(0);
    expect(harness.calls.preSubmit).toBe(0);
    expect(harness.calls.execute).toBe(0);
  });

  it("generic execute 的非成功结果原样透传", async () => {
    const execution: GitCheckpointExecutionResult = {
      outcome: ActionOutcome.NotApplied,
      evidenceIds: ["generic-evidence"],
      errorCode: "generic_not_applied",
    };
    const harness = createHarness({ execution: success(execution) });
    const result = await harness.service.execute(harness.input);

    expect(result).toEqual(success(execution));
    expect(harness.calls.execute).toBe(1);
  });
});

/** 测试用的 ChangeSet Checkpoint 服务及其调用计数。 */
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

/** 测试夹具的可控端口结果。 */
interface HarnessOptions {
  readonly existingCheckpoint?: boolean;
  readonly checkpointInspectionUnknown?: boolean;
  readonly preSubmitSnapshot?: CodingTaskSessionChangeSetSnapshot;
  readonly committedChangeSetDigest?: ContentDigest;
  readonly execution?: Result<GitCheckpointExecutionResult, HarnessError>;
}

function createHarness(options: HarnessOptions = {}): Harness {
  const snapshot = createSnapshot();
  const checkpoint: GitCheckpoint = {
    targetRevision,
    changedPaths: snapshot.changedPaths,
    checkpointDigest: digestOf({ targetRevision, changedPaths: snapshot.changedPaths }),
  };
  const calls = { assess: 0, inspect: 0, preSubmit: 0, committed: 0, execute: 0 };
  let existing = options.existingCheckpoint === true ? success(checkpoint) : failure(error());
  const committed: GitCommittedChangeSetInspectorPort = {
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
      return Promise.resolve(success(options.preSubmitSnapshot ?? snapshot));
    },
  };
  const gitCheckpoint: GitCheckpointRecoveryPort = {
    assess: () => {
      calls.assess += 1;
      if (options.checkpointInspectionUnknown === true) {
        return Promise.resolve(success({ status: GitCheckpointInspectionStatus.Unknown }));
      }
      return Promise.resolve(
        existing.status === ResultStatus.Success
          ? success({
              status: GitCheckpointInspectionStatus.Present,
              checkpoint: existing.value,
            })
          : success({ status: GitCheckpointInspectionStatus.Absent }),
      );
    },
    inspect: () => {
      calls.inspect += 1;
      return Promise.resolve(existing);
    },
    execute: () => {
      calls.execute += 1;
      existing = success(checkpoint);
      return Promise.resolve(
        options.execution ?? success({ outcome: ActionOutcome.Succeeded, evidenceIds: [] }),
      );
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
    service: new ChangeSetCheckpointService(changeSetInspector, committed, gitCheckpoint, digest),
    input,
    snapshot,
    calls,
  };
}

function createSnapshot(content = "changed"): CodingTaskSessionChangeSetSnapshot {
  const changeSet = createChangeSet(content);
  return requireValue(
    createCodingTaskSessionChangeSetSnapshot(
      {
        changeSet,
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

function createChangeSet(content = "changed"): CodingTaskSessionChangeSet {
  return requireValue(
    createCodingTaskSessionChangeSet(
      {
        repositoryId,
        baseRevision,
        changes: [
          {
            path: "src/changed.ts",
            kind: CodingTaskSessionChangeKind.Modified,
            targetContentDigest: digestOf({ content }),
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

function error(): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidStateTransition, "无可恢复 Checkpoint。");
}

function requireValue<T>(result: Result<T, unknown>): T {
  if (result.status !== ResultStatus.Success) throw new Error(String(result.error));
  return result.value;
}
