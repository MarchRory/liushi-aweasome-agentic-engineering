import {
  createCodingTaskSessionCloseoutRecoveryState,
  type CodingTaskSessionCloseoutRecoveryState,
} from "../../state/index.js";
import type { CodingTaskSessionCloseoutRecoveryAssessmentInternal } from "../../assessment/index.js";
import { HarnessError, HarnessErrorCode, failure, type Result } from "#common/index.js";

import type { CodingTaskSessionCloseoutRecoveryCommand } from "../../command/index.js";

/** 由锁内 fresh assessment 与已解析 Command 构造严格 Approved v0。 */
export function createApprovedRecoveryState(
  command: CodingTaskSessionCloseoutRecoveryCommand,
  fresh: CodingTaskSessionCloseoutRecoveryAssessmentInternal,
): Result<CodingTaskSessionCloseoutRecoveryState, HarnessError> {
  const snapshot = fresh.state.snapshot;
  if (snapshot === null) {
    return failure(
      new HarnessError(HarnessErrorCode.PreconditionNotMet, "Fresh Closeout Snapshot 不存在。"),
    );
  }
  return createCodingTaskSessionCloseoutRecoveryState({
    workspaceId: command.payload.workspaceId,
    sessionId: command.payload.sessionId,
    codingTaskId: fresh.assessment.codingTaskId,
    sourceTaskId: fresh.assessment.sourceTaskId,
    repositoryId: fresh.assessment.repositoryId,
    attemptNumber: fresh.assessment.attemptNumber,
    closeoutStateDigest: fresh.assessment.closeoutStateDigest,
    closeoutVersion: fresh.assessment.closeoutVersion,
    assessmentDigest: fresh.assessment.assessmentDigest,
    preSubmitSnapshotDigest: snapshot.snapshotDigest,
    changeSetDigest: snapshot.changeSetDigest,
    assessmentCheckpointBindingDigest: fresh.assessment.checkpointBindingDigest,
    requestDigest: command.requestDigest,
    requestedResolution: command.payload.requestedResolution,
    actor: command.actor,
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    ...(command.causationId === undefined ? {} : { causationId: command.causationId }),
    createdAt: command.submittedAt,
  });
}
