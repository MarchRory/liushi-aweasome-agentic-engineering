import type { ActionExecutionResult } from "#application/actionExecution/index.js";
import {
  GitCheckpointInspectionStatus,
  type ContentDigestPort,
  type GitChangeSetInspectorPort,
  type GitCheckpointRecoveryPort,
  type GitCommittedChangeSetInspectorPort,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import { ActionOutcome } from "#domain/actionJournal/index.js";
import {
  verifyCodingTaskSessionChangeSetSnapshot,
  type CodingTaskSessionChangeSetSnapshot,
} from "#domain/codingTaskSessionChangeSet/index.js";

import { CHANGE_SET_CHECKPOINT_SCHEMA_VERSION } from "../constants/index.js";
import type {
  ChangeSetCheckpoint,
  ChangeSetCheckpointInput,
  ChangeSetCheckpointPort,
} from "../contracts/index.js";
import { ChangeSetCheckpointErrorCode } from "../enums/index.js";

/** 为 ChangeSet 创建、验证并幂等恢复 Git Checkpoint。 */
export class ChangeSetCheckpointService implements ChangeSetCheckpointPort {
  public constructor(
    private readonly changeSetInspector: GitChangeSetInspectorPort,
    private readonly committedChangeSetInspector: GitCommittedChangeSetInspectorPort,
    private readonly gitCheckpoint: GitCheckpointRecoveryPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 只读重建并验证一个已存在的 ChangeSet-bound Checkpoint。 */
  public async inspect(
    input: ChangeSetCheckpointInput,
  ): Promise<Result<ChangeSetCheckpoint, HarnessError>> {
    const validated = this.validateInput(input);
    if (validated.status === ResultStatus.Failure) return validated;

    try {
      const checkpoint = await this.gitCheckpoint.inspect(input.checkpointInput);
      if (checkpoint.status === ResultStatus.Failure) return checkpoint;
      if (!samePaths(checkpoint.value.changedPaths, validated.value.snapshot.changedPaths)) {
        return failure(
          new HarnessError(
            HarnessErrorCode.PreconditionNotMet,
            "Git Checkpoint 的变更路径与持久化 Snapshot 不一致。",
            { field: "changedPaths" },
          ),
        );
      }

      const committed = await this.committedChangeSetInspector.inspectCommitted({
        repositoryId: input.checkpointInput.repositoryId,
        repositoryRoot: input.checkpointInput.repositoryRoot,
        worktreeBinding: input.checkpointInput.worktreeBinding,
        baseRevision: input.checkpointInput.baseRevision,
        targetRevision: checkpoint.value.targetRevision,
        writeSet: input.checkpointInput.writeSet,
      });
      if (committed.status === ResultStatus.Failure) return committed;
      if (committed.value.changeSetDigest !== validated.value.snapshot.changeSetDigest) {
        return failure(
          new HarnessError(
            HarnessErrorCode.PreconditionNotMet,
            "已提交 ChangeSet 的摘要与持久化 Snapshot 不一致。",
            { field: "changeSetDigest" },
          ),
        );
      }

      const bindingDigest = this.digest.calculate({
        schemaVersion: CHANGE_SET_CHECKPOINT_SCHEMA_VERSION,
        checkpointDigest: checkpoint.value.checkpointDigest,
        changeSetDigest: validated.value.snapshot.changeSetDigest,
        preSubmitSnapshotDigest: validated.value.snapshot.snapshotDigest,
      });
      if (bindingDigest.status === ResultStatus.Failure) return bindingDigest;
      return success({
        schemaVersion: CHANGE_SET_CHECKPOINT_SCHEMA_VERSION,
        checkpoint: checkpoint.value,
        changeSetDigest: validated.value.snapshot.changeSetDigest,
        preSubmitSnapshotDigest: validated.value.snapshot.snapshotDigest,
        bindingDigest: bindingDigest.value,
      });
    } catch (error) {
      return failure(unexpectedError("ChangeSet Checkpoint 只读检查失败。", error));
    }
  }

  /** 在提交前复验现场后创建或恢复一个 ChangeSet-bound Checkpoint。 */
  public async execute(
    input: ChangeSetCheckpointInput,
  ): Promise<Result<ActionExecutionResult, HarnessError>> {
    const validated = this.validateInput(input);
    if (validated.status === ResultStatus.Failure) return success(notApplied());

    let existing;
    try {
      existing = await this.gitCheckpoint.assess(input.checkpointInput);
    } catch {
      return success(unknown(ChangeSetCheckpointErrorCode.ExistingCheckpointMismatch));
    }
    if (
      existing.status === ResultStatus.Failure ||
      existing.value.status === GitCheckpointInspectionStatus.Unknown
    ) {
      return success(unknown(ChangeSetCheckpointErrorCode.ExistingCheckpointMismatch));
    }
    if (existing.value.status === GitCheckpointInspectionStatus.Present) {
      try {
        const recovered = await this.inspect(input);
        return recovered.status === ResultStatus.Success
          ? success(succeeded(recovered.value))
          : success(unknown(ChangeSetCheckpointErrorCode.ExistingCheckpointMismatch));
      } catch {
        return success(unknown(ChangeSetCheckpointErrorCode.ExistingCheckpointMismatch));
      }
    }

    let preSubmit;
    try {
      preSubmit = await this.changeSetInspector.inspectPreSubmit({
        repositoryId: input.checkpointInput.repositoryId,
        repositoryRoot: input.checkpointInput.repositoryRoot,
        worktreeBinding: input.checkpointInput.worktreeBinding,
        baseRevision: input.checkpointInput.baseRevision,
        writeSet: input.checkpointInput.writeSet,
      });
    } catch {
      return success(unknown(ChangeSetCheckpointErrorCode.PreSubmitDrift));
    }
    if (preSubmit.status === ResultStatus.Failure) {
      return success(unknown(ChangeSetCheckpointErrorCode.PreSubmitDrift));
    }
    const currentSnapshot = verifyCodingTaskSessionChangeSetSnapshot(preSubmit.value, this.digest);
    if (currentSnapshot.status === ResultStatus.Failure) {
      return success(unknown(ChangeSetCheckpointErrorCode.PreSubmitDrift));
    }
    if (currentSnapshot.value.snapshotDigest !== validated.value.snapshot.snapshotDigest) {
      return success(notApplied(ChangeSetCheckpointErrorCode.PreSubmitDrift));
    }

    let execution;
    try {
      execution = await this.gitCheckpoint.execute(input.checkpointInput);
    } catch {
      return success(unknown(ChangeSetCheckpointErrorCode.PostconditionUnknown));
    }
    if (execution.status === ResultStatus.Failure) return execution;
    if (execution.value.outcome !== ActionOutcome.Succeeded) return execution;

    try {
      const postcondition = await this.inspect(input);
      return postcondition.status === ResultStatus.Success
        ? success(succeeded(postcondition.value))
        : success(unknown(ChangeSetCheckpointErrorCode.PostconditionUnknown));
    } catch {
      return success(unknown(ChangeSetCheckpointErrorCode.PostconditionUnknown));
    }
  }

  private validateInput(
    input: ChangeSetCheckpointInput,
  ): Result<{ readonly snapshot: CodingTaskSessionChangeSetSnapshot }, HarnessErrorType> {
    try {
      const snapshot = verifyCodingTaskSessionChangeSetSnapshot(
        input.preSubmitSnapshot,
        this.digest,
      );
      if (snapshot.status === ResultStatus.Failure) return snapshot;
      const checkpointInput = input.checkpointInput;
      const binding = checkpointInput.worktreeBinding;
      if (
        !binding.managed ||
        snapshot.value.observedHeadRevision !== snapshot.value.baseRevision ||
        snapshot.value.changedPaths.length === 0 ||
        snapshot.value.repositoryId !== checkpointInput.repositoryId ||
        snapshot.value.worktreeId !== binding.worktreeId ||
        snapshot.value.worktreeRelativePath !== binding.relativePath ||
        snapshot.value.branchName !== binding.branchName ||
        snapshot.value.baseRevision !== checkpointInput.baseRevision ||
        !samePaths(snapshot.value.writeSet, checkpointInput.writeSet)
      ) {
        return failure(
          new HarnessError(
            HarnessErrorCode.InvalidInput,
            "ChangeSet Checkpoint 输入身份或摘要绑定无效。",
            { field: "binding" },
          ),
        );
      }
      return success({ snapshot: snapshot.value });
    } catch (error) {
      return failure(unexpectedError("ChangeSet Checkpoint 输入校验失败。", error));
    }
  }
}

function succeeded(checkpoint: ChangeSetCheckpoint): ActionExecutionResult {
  return {
    outcome: ActionOutcome.Succeeded,
    evidenceIds: [
      `git:${checkpoint.checkpoint.targetRevision}`,
      `changeset:${checkpoint.changeSetDigest}`,
      `snapshot:${checkpoint.preSubmitSnapshotDigest}`,
    ],
    outputDigest: checkpoint.bindingDigest,
  };
}

function notApplied(
  errorCode: ChangeSetCheckpointErrorCode = ChangeSetCheckpointErrorCode.InputInvalid,
) {
  return { outcome: ActionOutcome.NotApplied, evidenceIds: [], errorCode } as const;
}

function unknown(errorCode: ChangeSetCheckpointErrorCode) {
  return { outcome: ActionOutcome.OutcomeUnknown, evidenceIds: [], errorCode } as const;
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function unexpectedError(message: string, cause: unknown): HarnessError {
  return new HarnessError(HarnessErrorCode.IoFailure, message, {}, cause);
}
