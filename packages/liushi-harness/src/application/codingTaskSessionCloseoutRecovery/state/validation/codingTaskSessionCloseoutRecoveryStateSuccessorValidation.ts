import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import type { CodingTaskSessionCloseoutRecoveryState } from "../contracts/index.js";
import { CodingTaskSessionCloseoutRecoveryResolution } from "#application/codingTaskSessionCloseoutRecovery/enums/index.js";
import { CodingTaskSessionCloseoutRecoveryStateStatus } from "../enums/index.js";
import { rebuildCodingTaskSessionCloseoutRecoveryState } from "./codingTaskSessionCloseoutRecoveryStateValidation.js";

/** 严格验证 Recovery Store 的前后状态 CAS successor。 */
export function validateCodingTaskSessionCloseoutRecoveryStateSuccessor(
  currentInput: unknown,
  candidateInput: unknown,
  digestPort: ContentDigestPort,
): Result<CodingTaskSessionCloseoutRecoveryState, HarnessError> {
  const current = rebuildCodingTaskSessionCloseoutRecoveryState(currentInput, digestPort);
  if (current.status === ResultStatus.Failure) return current;
  const candidate = rebuildCodingTaskSessionCloseoutRecoveryState(candidateInput, digestPort);
  if (candidate.status === ResultStatus.Failure) return candidate;
  if (!hasSameCodingTaskSessionCloseoutRecoveryIdentity(current.value, candidate.value)) {
    return failure(
      new HarnessError(HarnessErrorCode.PreconditionNotMet, "Recovery State 身份不可变。"),
    );
  }
  if (
    candidate.value.version !== current.value.version + 1 ||
    Date.parse(candidate.value.updatedAt) < Date.parse(current.value.updatedAt)
  ) {
    return failure(invalidSuccessor("Recovery State 版本或时间不是当前状态的合法 successor。"));
  }
  return isLegalSuccessor(current.value, candidate.value)
    ? success(candidate.value)
    : failure(invalidSuccessor("Recovery State 的前驱、后继或 Resolution 不合法。"));
}

/** 比较 Recovery State 的完整不可变命令身份。 */
export function hasSameCodingTaskSessionCloseoutRecoveryIdentity(
  left: CodingTaskSessionCloseoutRecoveryState,
  right: CodingTaskSessionCloseoutRecoveryState,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.workspaceId === right.workspaceId &&
    left.sessionId === right.sessionId &&
    left.codingTaskId === right.codingTaskId &&
    left.sourceTaskId === right.sourceTaskId &&
    left.repositoryId === right.repositoryId &&
    left.attemptNumber === right.attemptNumber &&
    left.closeoutStateDigest === right.closeoutStateDigest &&
    left.closeoutVersion === right.closeoutVersion &&
    left.assessmentDigest === right.assessmentDigest &&
    left.preSubmitSnapshotDigest === right.preSubmitSnapshotDigest &&
    left.changeSetDigest === right.changeSetDigest &&
    left.assessmentCheckpointBindingDigest === right.assessmentCheckpointBindingDigest &&
    left.requestDigest === right.requestDigest &&
    left.requestedResolution === right.requestedResolution &&
    left.commandId === right.commandId &&
    left.idempotencyKey === right.idempotencyKey &&
    left.correlationId === right.correlationId &&
    left.causationId === right.causationId &&
    left.createdAt === right.createdAt &&
    left.actor.kind === right.actor.kind &&
    left.actor.actorId === right.actor.actorId
  );
}

function isLegalSuccessor(
  current: CodingTaskSessionCloseoutRecoveryState,
  candidate: CodingTaskSessionCloseoutRecoveryState,
): boolean {
  switch (current.status) {
    case CodingTaskSessionCloseoutRecoveryStateStatus.Approved:
      return isApprovedSuccessor(candidate, current.requestedResolution);
    case CodingTaskSessionCloseoutRecoveryStateStatus.Executing:
      return isExecutingSuccessor(candidate);
    case CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound:
    case CodingTaskSessionCloseoutRecoveryStateStatus.RetryNotApplied:
    case CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown:
    case CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired:
      return false;
  }
}

function isApprovedSuccessor(
  candidate: CodingTaskSessionCloseoutRecoveryState,
  resolution: CodingTaskSessionCloseoutRecoveryResolution,
): boolean {
  if (candidate.status === CodingTaskSessionCloseoutRecoveryStateStatus.Executing) {
    return resolution === CodingTaskSessionCloseoutRecoveryResolution.RetryOnce;
  }
  if (candidate.status === CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound) {
    return (
      resolution === CodingTaskSessionCloseoutRecoveryResolution.BindExisting &&
      candidate.checkpoint !== null
    );
  }
  return candidate.status === CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired;
}

function isExecutingSuccessor(candidate: CodingTaskSessionCloseoutRecoveryState): boolean {
  if (candidate.requestedResolution !== CodingTaskSessionCloseoutRecoveryResolution.RetryOnce) {
    return false;
  }
  if (candidate.status === CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound) {
    return candidate.checkpoint !== null;
  }
  return (
    candidate.status === CodingTaskSessionCloseoutRecoveryStateStatus.RetryNotApplied ||
    candidate.status === CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown ||
    candidate.status === CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired
  );
}

function invalidSuccessor(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidStateTransition, message);
}
