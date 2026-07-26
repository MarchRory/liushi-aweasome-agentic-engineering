import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";

import type {
  CodingTaskSessionCloseoutBindCheckpointInput,
  CodingTaskSessionCloseoutPersistSnapshotInput,
  CodingTaskSessionCloseoutState,
  CodingTaskSessionCloseoutStateResult,
  CodingTaskSessionCloseoutTerminalInput,
} from "../contracts/index.js";
import { CodingTaskSessionCloseoutStage, CodingTaskSessionCloseoutStatus } from "../enums/index.js";
import { calculateCloseoutCoverageBindingDigest } from "../digest/index.js";
import {
  invalid,
  parseHarnessErrorCode,
  parseIsoUtc,
  parseSafeText,
  rebuildCodingTaskSessionCloseoutState,
  rebuildCloseoutCheckpoint,
  rebuildCloseoutCoverageManifest,
  rebuildCloseoutSnapshot,
  validateCloseoutCoverageIdentity,
} from "../validation/index.js";

/** 仅从 Closing 一次性持久化 Snapshot 与完整 Coverage Manifest。 */
export function persistSnapshot(
  state: CodingTaskSessionCloseoutState,
  input: CodingTaskSessionCloseoutPersistSnapshotInput,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutStateResult {
  const current = validState(state, digestPort);
  if (current.status === ResultStatus.Failure) return current;
  if (current.value.status !== CodingTaskSessionCloseoutStatus.Closing) {
    return transitionError(current.value, "当前 Closeout 阶段不允许持久化 Snapshot。");
  }
  const updatedAt = parseIsoUtc(input?.updatedAt, "updatedAt");
  if (updatedAt.status === ResultStatus.Failure) return updatedAt;
  const snapshot = rebuildCloseoutSnapshot(input?.snapshot, digestPort);
  if (snapshot.status === ResultStatus.Failure) return snapshot;
  const coverageManifest = rebuildCloseoutCoverageManifest(input?.coverageManifest, digestPort);
  if (coverageManifest.status === ResultStatus.Failure) return coverageManifest;
  const identity = validateCloseoutCoverageIdentity(
    current.value,
    snapshot.value,
    coverageManifest.value,
  );
  if (identity.status === ResultStatus.Failure) return identity;
  const coverageBindingDigest = calculateCloseoutCoverageBindingDigest(
    snapshot.value.snapshotDigest,
    coverageManifest.value.manifestDigest,
    digestPort,
  );
  if (coverageBindingDigest.status === ResultStatus.Failure) return coverageBindingDigest;
  return nextState(
    current.value,
    {
      status: CodingTaskSessionCloseoutStatus.SnapshotPersisted,
      snapshot: snapshot.value,
      coverageManifest: coverageManifest.value,
      coverageBindingDigest: coverageBindingDigest.value,
      updatedAt: updatedAt.value,
    },
    digestPort,
  );
}

/** 仅从 SnapshotPersisted 绑定与 Snapshot 一致的 ChangeSet Checkpoint。 */
export function bindCheckpoint(
  state: CodingTaskSessionCloseoutState,
  input: CodingTaskSessionCloseoutBindCheckpointInput,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutStateResult {
  const current = validState(state, digestPort);
  if (current.status === ResultStatus.Failure) return current;
  if (current.value.status !== CodingTaskSessionCloseoutStatus.SnapshotPersisted) {
    return transitionError(current.value, "当前 Closeout 阶段不允许绑定 Checkpoint。");
  }
  const updatedAt = parseIsoUtc(input?.updatedAt, "updatedAt");
  if (updatedAt.status === ResultStatus.Failure) return updatedAt;
  const checkpoint = rebuildCloseoutCheckpoint(input?.checkpoint, digestPort);
  if (checkpoint.status === ResultStatus.Failure) return checkpoint;
  const snapshot = current.value.snapshot;
  if (
    snapshot === null ||
    checkpoint.value.changeSetDigest !== snapshot.changeSetDigest ||
    checkpoint.value.preSubmitSnapshotDigest !== snapshot.snapshotDigest ||
    checkpoint.value.checkpoint.changedPaths.length !== snapshot.changedPaths.length ||
    !checkpoint.value.checkpoint.changedPaths.every(
      (path, index) => path === snapshot.changedPaths[index],
    )
  ) {
    return failure(mismatch("Checkpoint 与 Snapshot 摘要或路径不一致。"));
  }
  return nextState(
    current.value,
    {
      status: CodingTaskSessionCloseoutStatus.CheckpointBound,
      checkpoint: checkpoint.value,
      updatedAt: updatedAt.value,
    },
    digestPort,
  );
}

/** 从活动 Closeout 阶段进入已知阻断终态，并保留已有证据。 */
export function block(
  state: CodingTaskSessionCloseoutState,
  input: CodingTaskSessionCloseoutTerminalInput,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutStateResult {
  return terminalize(state, input, CodingTaskSessionCloseoutStatus.Blocked, digestPort);
}

/** 从活动 Closeout 阶段进入结果未知终态，并保留已有证据。 */
export function markOutcomeUnknown(
  state: CodingTaskSessionCloseoutState,
  input: CodingTaskSessionCloseoutTerminalInput,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutStateResult {
  return terminalize(state, input, CodingTaskSessionCloseoutStatus.OutcomeUnknown, digestPort);
}

function terminalize(
  state: CodingTaskSessionCloseoutState,
  input: CodingTaskSessionCloseoutTerminalInput,
  status: CodingTaskSessionCloseoutStatus.Blocked | CodingTaskSessionCloseoutStatus.OutcomeUnknown,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutStateResult {
  const current = validState(state, digestPort);
  if (current.status === ResultStatus.Failure) return current;
  if (
    current.value.status === CodingTaskSessionCloseoutStatus.Blocked ||
    current.value.status === CodingTaskSessionCloseoutStatus.OutcomeUnknown
  ) {
    return transitionError(current.value, "终止状态不允许继续推进。");
  }
  const updatedAt = parseIsoUtc(input?.updatedAt, "updatedAt");
  if (updatedAt.status === ResultStatus.Failure) return updatedAt;
  const errorCode = parseHarnessErrorCode(input?.errorCode);
  if (errorCode.status === ResultStatus.Failure) return errorCode;
  const recoveryGuidance = parseSafeText(input?.recoveryGuidance, "recoveryGuidance");
  if (recoveryGuidance.status === ResultStatus.Failure) return recoveryGuidance;
  return nextState(
    current.value,
    {
      status,
      stoppedStage: activeStage(current.value.status),
      errorCode: errorCode.value,
      recoveryGuidance: recoveryGuidance.value,
      updatedAt: updatedAt.value,
    },
    digestPort,
  );
}

function validState(
  state: CodingTaskSessionCloseoutState,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutStateResult {
  return rebuildCodingTaskSessionCloseoutState(state, digestPort);
}

function nextState(
  state: CodingTaskSessionCloseoutState,
  changes: Partial<CodingTaskSessionCloseoutState>,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutStateResult {
  if (
    changes.updatedAt !== undefined &&
    Date.parse(changes.updatedAt) < Date.parse(state.updatedAt)
  ) {
    return failure(invalid("updatedAt", "Closeout State updatedAt 不得倒退。"));
  }
  return rebuildCodingTaskSessionCloseoutState(
    {
      ...state,
      ...changes,
      version: state.version + 1,
    },
    digestPort,
  );
}

function activeStage(
  status:
    | CodingTaskSessionCloseoutStatus.Closing
    | CodingTaskSessionCloseoutStatus.SnapshotPersisted
    | CodingTaskSessionCloseoutStatus.CheckpointBound,
): CodingTaskSessionCloseoutStage {
  switch (status) {
    case CodingTaskSessionCloseoutStatus.Closing:
      return CodingTaskSessionCloseoutStage.Closing;
    case CodingTaskSessionCloseoutStatus.SnapshotPersisted:
      return CodingTaskSessionCloseoutStage.SnapshotPersisted;
    case CodingTaskSessionCloseoutStatus.CheckpointBound:
      return CodingTaskSessionCloseoutStage.CheckpointBound;
  }
}

function transitionError(
  state: CodingTaskSessionCloseoutState,
  message: string,
): Result<never, HarnessErrorType> {
  return failure(
    new HarnessError(HarnessErrorCode.InvalidStateTransition, message, {
      status: state.status,
    }),
  );
}

function mismatch(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.PreconditionNotMet, message);
}
