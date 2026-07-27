import type { ChangeSetCheckpoint } from "#application/changeSetCheckpoint/index.js";

import type { CodingTaskSessionCloseoutRecoveryAssessmentInternal } from "../../assessment/index.js";
import type { CodingTaskSessionCloseoutRecoveryCommand } from "../../command/index.js";
import { CodingTaskSessionCloseoutRecoveryDisposition } from "../../enums/index.js";
import type { CodingTaskSessionCloseoutRecoveryState } from "../../state/index.js";

/** 校验新鲜 Assessment 与 Human Command 的授权三元组及可执行处置。 */
export function hasFreshCommandAuthorization(
  command: CodingTaskSessionCloseoutRecoveryCommand,
  fresh: CodingTaskSessionCloseoutRecoveryAssessmentInternal,
): boolean {
  return (
    command.expectedVersion === fresh.assessment.closeoutVersion &&
    command.payload.expectedAssessmentDigest === fresh.assessment.assessmentDigest &&
    command.payload.requestedResolution === fresh.assessment.allowedResolution &&
    fresh.assessment.disposition ===
      CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable
  );
}

/** 校验持久化命令身份，避免不同 Human Command 覆盖既有 Recovery。 */
export function hasSamePersistedCommand(
  state: CodingTaskSessionCloseoutRecoveryState,
  command: CodingTaskSessionCloseoutRecoveryCommand,
): boolean {
  return (
    state.workspaceId === command.payload.workspaceId &&
    state.sessionId === command.payload.sessionId &&
    state.commandId === command.commandId &&
    state.idempotencyKey === command.idempotencyKey &&
    state.correlationId === command.correlationId &&
    state.causationId === command.causationId &&
    state.requestDigest === command.requestDigest &&
    state.requestedResolution === command.payload.requestedResolution &&
    state.actor.kind === command.actor.kind &&
    state.actor.actorId === command.actor.actorId &&
    state.createdAt === command.submittedAt &&
    state.closeoutVersion === command.expectedVersion
  );
}

/** 校验 fresh assessment 是否仍与 Process State 锁定的 Closeout/Snapshot/ChangeSet 身份一致。 */
export function hasSameFreshIdentity(
  state: CodingTaskSessionCloseoutRecoveryState,
  fresh: CodingTaskSessionCloseoutRecoveryAssessmentInternal,
): boolean {
  const snapshot = fresh.state.snapshot;
  return (
    snapshot !== null &&
    state.workspaceId === fresh.assessment.workspaceId &&
    state.sessionId === fresh.assessment.sessionId &&
    state.codingTaskId === fresh.assessment.codingTaskId &&
    state.sourceTaskId === fresh.assessment.sourceTaskId &&
    state.repositoryId === fresh.assessment.repositoryId &&
    state.attemptNumber === fresh.assessment.attemptNumber &&
    state.closeoutStateDigest === fresh.assessment.closeoutStateDigest &&
    state.closeoutVersion === fresh.assessment.closeoutVersion &&
    state.preSubmitSnapshotDigest === snapshot.snapshotDigest &&
    state.changeSetDigest === snapshot.changeSetDigest
  );
}

/** Approved 状态还必须精确保持初次 Human 授权的 Assessment Digest。 */
export function hasSameApprovedAssessment(
  state: CodingTaskSessionCloseoutRecoveryState,
  fresh: CodingTaskSessionCloseoutRecoveryAssessmentInternal,
): boolean {
  return state.assessmentDigest === fresh.assessment.assessmentDigest;
}

/** 证明 Checkpoint 与 Recovery Record 固定的 Snapshot/ChangeSet 身份一致。 */
export function hasMatchingCheckpointIdentity(
  state: CodingTaskSessionCloseoutRecoveryState,
  checkpoint: ChangeSetCheckpoint,
): boolean {
  return (
    checkpoint.preSubmitSnapshotDigest === state.preSubmitSnapshotDigest &&
    checkpoint.changeSetDigest === state.changeSetDigest
  );
}
