import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";

import {
  CODING_TASK_SESSION_CHANGE_SET_SCHEMA_VERSION,
  CODING_TASK_SESSION_CHANGE_SET_SNAPSHOT_SCHEMA_VERSION,
} from "../constants/index.js";
import type {
  CodingTaskSessionChangeSetDigestPort,
  CodingTaskSessionChangeSet,
  CodingTaskSessionChangeSetDigestInput,
  CodingTaskSessionChangeSetSnapshot,
  CodingTaskSessionChangeSetSnapshotDigestInput,
  CreateCodingTaskSessionChangeSetInput,
  CreateCodingTaskSessionChangeSetSnapshotInput,
} from "../contracts/index.js";
import {
  collectCodingTaskSessionChangeSetChangedPaths,
  validateCodingTaskSessionChangeSet,
  validateCodingTaskSessionChangeSetInput,
  validateCodingTaskSessionChangeSetSnapshotInput,
} from "../validation/index.js";

/** 创建只绑定 Repository、Base 和规范变化集合的权威 ChangeSet。 */
export function createCodingTaskSessionChangeSet(
  input: CreateCodingTaskSessionChangeSetInput,
  digestPort: CodingTaskSessionChangeSetDigestPort,
): Result<CodingTaskSessionChangeSet, HarnessErrorType> {
  const candidate: CodingTaskSessionChangeSetDigestInput = {
    schemaVersion: CODING_TASK_SESSION_CHANGE_SET_SCHEMA_VERSION,
    repositoryId: input.repositoryId,
    baseRevision: input.baseRevision,
    changes: input.changes,
  };
  const validated = validateCodingTaskSessionChangeSetInput(candidate);
  if (validated.status === ResultStatus.Failure) return validated;
  const digest = digestPort.calculate(validated.value);
  if (digest.status === ResultStatus.Failure) return digest;
  return success({ ...validated.value, changeSetDigest: digest.value });
}

/** 创建额外绑定 Worktree 现场的独立 ChangeSet Snapshot。 */
export function createCodingTaskSessionChangeSetSnapshot(
  input: CreateCodingTaskSessionChangeSetSnapshotInput,
  digestPort: CodingTaskSessionChangeSetDigestPort,
): Result<CodingTaskSessionChangeSetSnapshot, HarnessErrorType> {
  const changeSet = validateCodingTaskSessionChangeSet(input.changeSet);
  if (changeSet.status === ResultStatus.Failure) return changeSet;
  const expectedChangeSetDigest = digestPort.calculate({
    schemaVersion: changeSet.value.schemaVersion,
    repositoryId: changeSet.value.repositoryId,
    baseRevision: changeSet.value.baseRevision,
    changes: changeSet.value.changes,
  });
  if (expectedChangeSetDigest.status === ResultStatus.Failure) return expectedChangeSetDigest;
  if (expectedChangeSetDigest.value !== changeSet.value.changeSetDigest) {
    return failure(
      new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        "CodingTask Session ChangeSet 摘要发生漂移。",
        { field: "changeSetDigest" },
      ),
    );
  }

  const candidate: CodingTaskSessionChangeSetSnapshotDigestInput = {
    schemaVersion: CODING_TASK_SESSION_CHANGE_SET_SNAPSHOT_SCHEMA_VERSION,
    repositoryId: changeSet.value.repositoryId,
    worktreeId: input.worktreeId,
    worktreeRelativePath: input.worktreeRelativePath,
    branchName: input.branchName,
    baseRevision: changeSet.value.baseRevision,
    observedHeadRevision: input.observedHeadRevision,
    writeSet: input.writeSet,
    changedPaths: collectCodingTaskSessionChangeSetChangedPaths(changeSet.value.changes),
    changes: changeSet.value.changes,
    changeSetDigest: changeSet.value.changeSetDigest,
  };
  const validated = validateCodingTaskSessionChangeSetSnapshotInput(candidate);
  if (validated.status === ResultStatus.Failure) return validated;
  const snapshotDigest = digestPort.calculate(validated.value);
  if (snapshotDigest.status === ResultStatus.Failure) return snapshotDigest;
  return success({ ...validated.value, snapshotDigest: snapshotDigest.value });
}

/** 重算 ChangeSet 与 Snapshot 摘要，拒绝任何字段或摘要漂移。 */
export function verifyCodingTaskSessionChangeSetSnapshot(
  input: CodingTaskSessionChangeSetSnapshot,
  digestPort: CodingTaskSessionChangeSetDigestPort,
): Result<CodingTaskSessionChangeSetSnapshot, HarnessErrorType> {
  const changeSet = validateCodingTaskSessionChangeSet({
    schemaVersion: CODING_TASK_SESSION_CHANGE_SET_SCHEMA_VERSION,
    repositoryId: input.repositoryId,
    baseRevision: input.baseRevision,
    changes: input.changes,
    changeSetDigest: input.changeSetDigest,
  });
  if (changeSet.status === ResultStatus.Failure) return changeSet;
  const expectedChangeSetDigest = digestPort.calculate({
    schemaVersion: changeSet.value.schemaVersion,
    repositoryId: changeSet.value.repositoryId,
    baseRevision: changeSet.value.baseRevision,
    changes: changeSet.value.changes,
  });
  if (expectedChangeSetDigest.status === ResultStatus.Failure) {
    return expectedChangeSetDigest;
  }
  if (expectedChangeSetDigest.value !== input.changeSetDigest) {
    return failure(
      new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        "CodingTask Session ChangeSet 摘要验证失败。",
        { field: "changeSetDigest" },
      ),
    );
  }

  const snapshot = createCodingTaskSessionChangeSetSnapshot(
    {
      changeSet: changeSet.value,
      worktreeId: input.worktreeId,
      worktreeRelativePath: input.worktreeRelativePath,
      branchName: input.branchName,
      observedHeadRevision: input.observedHeadRevision,
      writeSet: input.writeSet,
    },
    digestPort,
  );
  if (snapshot.status === ResultStatus.Failure) return snapshot;
  if (snapshot.value.snapshotDigest !== input.snapshotDigest) {
    return failure(
      new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        "CodingTask Session ChangeSet Snapshot 摘要验证失败。",
        { field: "snapshotDigest" },
      ),
    );
  }
  return snapshot;
}
