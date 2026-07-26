import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import { parseActionId, type ActionId } from "#domain/actionJournal/index.js";

import type {
  CodingTaskSessionCloseoutBindCheckpointInput,
  CodingTaskSessionCloseoutPersistSnapshotInput,
  CodingTaskSessionCloseoutState,
  CodingTaskSessionCloseoutStateResult,
  CodingTaskSessionCloseoutTerminalInput,
} from "../contracts/index.js";
import { CodingTaskSessionCloseoutStage, CodingTaskSessionCloseoutStatus } from "../enums/index.js";
import {
  invalid,
  parseDigest,
  parseHarnessErrorCode,
  parseIsoUtc,
  parseSafeText,
  rebuildCodingTaskSessionCloseoutState,
  rebuildCloseoutCheckpoint,
  rebuildCloseoutSnapshot,
  verifyCloseoutActionEvidenceDigest,
} from "../validation/index.js";

/** 仅从 Closing 持久化 Snapshot 与非空 Action Evidence。 */
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
  if (snapshot.value.repositoryId !== current.value.repositoryId) {
    return failure(mismatch("Snapshot Repository 身份与 Closeout 不一致。"));
  }
  const normalizedIds = normalizeActionIds(input?.coveredActionIds);
  if (normalizedIds.status === ResultStatus.Failure) return normalizedIds;
  const evidence = verifyCloseoutActionEvidenceDigest(
    snapshot.value.snapshotDigest,
    normalizedIds.value,
    input?.actionEvidenceDigest,
    digestPort,
  );
  if (evidence.status === ResultStatus.Failure) return evidence;
  const evidenceDigest = parseDigest(input?.actionEvidenceDigest, "actionEvidenceDigest");
  if (evidenceDigest.status === ResultStatus.Failure) return evidenceDigest;
  return nextState(
    current.value,
    {
      status: CodingTaskSessionCloseoutStatus.SnapshotPersisted,
      snapshot: snapshot.value,
      coveredActionIds: evidence.value,
      actionEvidenceDigest: evidenceDigest.value,
      updatedAt: updatedAt.value,
    },
    digestPort,
  );
}

/** 仅从 SnapshotPersisted 绑定摘要一致的 ChangeSet Checkpoint。 */
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

function normalizeActionIds(input: unknown): Result<readonly ActionId[], HarnessError> {
  if (!Array.isArray(input)) return failure(invalid("coveredActionIds"));
  const parsed: ActionId[] = [];
  for (const value of input) {
    if (typeof value !== "string") return failure(invalid("coveredActionIds"));
    const actionId = parseActionId(value);
    if (actionId.status === ResultStatus.Failure) return failure(invalid("coveredActionIds"));
    parsed.push(actionId.value);
  }
  if (new Set(parsed).size !== parsed.length) {
    return failure(invalid("coveredActionIds"));
  }
  return success(Object.freeze([...parsed].sort()));
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
