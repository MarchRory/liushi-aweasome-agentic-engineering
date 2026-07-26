import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";

import type { CodingTaskSessionCloseoutState } from "../contracts/index.js";
import { CodingTaskSessionCloseoutStage, CodingTaskSessionCloseoutStatus } from "../enums/index.js";
import { rebuildCodingTaskSessionCloseoutState } from "./codingTaskSessionCloseoutStateValidation.js";

/** 验证候选 State 是当前持久化 State 的唯一合法后继。 */
export function validateCodingTaskSessionCloseoutSuccessor(
  currentInput: CodingTaskSessionCloseoutState,
  candidateInput: CodingTaskSessionCloseoutState,
  digestPort: ContentDigestPort,
): Result<CodingTaskSessionCloseoutState, HarnessError> {
  const current = rebuildCodingTaskSessionCloseoutState(currentInput, digestPort);
  if (current.status === ResultStatus.Failure) return current;
  const candidate = rebuildCodingTaskSessionCloseoutState(candidateInput, digestPort);
  if (candidate.status === ResultStatus.Failure) return candidate;
  if (!hasSameCodingTaskSessionCloseoutIdentity(current.value, candidate.value)) {
    return failure(
      new HarnessError(HarnessErrorCode.PreconditionNotMet, "Closeout State 身份不可变。"),
    );
  }
  if (
    candidate.value.version !== current.value.version + 1 ||
    Date.parse(candidate.value.updatedAt) < Date.parse(current.value.updatedAt)
  ) {
    return failure(invalidSuccessor("Closeout State 版本或时间不是当前状态的合法后继。"));
  }

  const valid =
    isActiveSuccessor(current.value, candidate.value) ||
    isTerminalSuccessor(current.value, candidate.value);
  return valid
    ? success(candidate.value)
    : failure(invalidSuccessor("Closeout State 后继阶段或证据连续性无效。"));
}

/** 比较 Closeout State 的全部不可变请求身份。 */
export function hasSameCodingTaskSessionCloseoutIdentity(
  left: CodingTaskSessionCloseoutState,
  right: CodingTaskSessionCloseoutState,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.workspaceId === right.workspaceId &&
    left.sessionId === right.sessionId &&
    left.codingTaskId === right.codingTaskId &&
    left.sourceTaskId === right.sourceTaskId &&
    left.repositoryId === right.repositoryId &&
    left.attemptNumber === right.attemptNumber &&
    left.activationBindingDigest === right.activationBindingDigest &&
    left.sessionBindingDigest === right.sessionBindingDigest &&
    left.requestDigest === right.requestDigest &&
    left.idempotencyKey === right.idempotencyKey &&
    left.commandId === right.commandId &&
    left.correlationId === right.correlationId &&
    left.causationId === right.causationId &&
    left.createdAt === right.createdAt &&
    left.actor.kind === right.actor.kind &&
    left.actor.actorId === right.actor.actorId
  );
}

function isActiveSuccessor(
  current: CodingTaskSessionCloseoutState,
  candidate: CodingTaskSessionCloseoutState,
): boolean {
  if (
    current.status === CodingTaskSessionCloseoutStatus.Closing &&
    candidate.status === CodingTaskSessionCloseoutStatus.SnapshotPersisted
  ) {
    return true;
  }
  return (
    current.status === CodingTaskSessionCloseoutStatus.SnapshotPersisted &&
    candidate.status === CodingTaskSessionCloseoutStatus.CheckpointBound &&
    preservesSnapshotEvidence(current, candidate)
  );
}

function isTerminalSuccessor(
  current: CodingTaskSessionCloseoutState,
  candidate: CodingTaskSessionCloseoutState,
): boolean {
  if (
    candidate.status !== CodingTaskSessionCloseoutStatus.Blocked &&
    candidate.status !== CodingTaskSessionCloseoutStatus.OutcomeUnknown
  ) {
    return false;
  }
  switch (current.status) {
    case CodingTaskSessionCloseoutStatus.Closing:
      return candidate.stoppedStage === CodingTaskSessionCloseoutStage.Closing;
    case CodingTaskSessionCloseoutStatus.SnapshotPersisted:
      return (
        candidate.stoppedStage === CodingTaskSessionCloseoutStage.SnapshotPersisted &&
        preservesSnapshotEvidence(current, candidate)
      );
    case CodingTaskSessionCloseoutStatus.CheckpointBound:
      return (
        candidate.stoppedStage === CodingTaskSessionCloseoutStage.CheckpointBound &&
        preservesSnapshotEvidence(current, candidate) &&
        current.checkpoint?.bindingDigest === candidate.checkpoint?.bindingDigest
      );
    case CodingTaskSessionCloseoutStatus.Blocked:
    case CodingTaskSessionCloseoutStatus.OutcomeUnknown:
      return false;
  }
}

function preservesSnapshotEvidence(
  current: CodingTaskSessionCloseoutState,
  candidate: CodingTaskSessionCloseoutState,
): boolean {
  return (
    current.snapshot?.snapshotDigest === candidate.snapshot?.snapshotDigest &&
    current.coverageManifest?.manifestDigest === candidate.coverageManifest?.manifestDigest &&
    current.coverageBindingDigest === candidate.coverageBindingDigest
  );
}

function invalidSuccessor(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidStateTransition, message);
}
