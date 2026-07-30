import {
  CodingTaskSessionCloseoutStatus,
  type CodingTaskSessionCloseoutState,
} from "#application/codingTaskSessionCloseoutState/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import type { AgentSessionProcessEvidence } from "#domain/agentSessionProcessEvidence/index.js";
import {
  ActionJournalStatus,
  ActionKind,
  ActionOutcome,
  type ActionJournalState,
} from "#domain/actionJournal/index.js";
import type { CodingTaskSessionActivationRecord } from "#domain/codingTaskSession/index.js";
import type { PilotEnrollment, PilotSettlement } from "#domain/pilotMetrics/index.js";
import type { EvidenceBundle } from "#domain/verification/index.js";

import type { PilotMetricsBoundEvidence } from "../contracts/index.js";

/** 交叉验证 Session 身份、时间、Worktree 与 Verification Revision。 */
export function bindPilotMetricsEvidence(
  enrollment: PilotEnrollment,
  settlement: PilotSettlement,
  activation: CodingTaskSessionActivationRecord,
  processEvidence: AgentSessionProcessEvidence,
  closeoutState: CodingTaskSessionCloseoutState,
  evidenceBundle: EvidenceBundle,
  verificationActionJournal: ActionJournalState,
  contentDigest: ContentDigestPort,
): Result<PilotMetricsBoundEvidence, HarnessError> {
  const identity = validateIdentity(enrollment, activation, processEvidence, closeoutState);
  if (identity !== null) return identity;
  const revision = validateRevisionBinding(
    enrollment,
    settlement,
    activation,
    closeoutState,
    evidenceBundle,
  );
  if (revision !== null) return revision;
  if (closeoutState.checkpoint === null) {
    return invalid("CheckpointBound Closeout 缺少 Checkpoint。");
  }
  const evidenceBundleDigest = contentDigest.calculate(evidenceBundle);
  if (evidenceBundleDigest.status === ResultStatus.Failure) return evidenceBundleDigest;
  const verificationAction = validateVerificationAction(
    enrollment,
    settlement,
    activation,
    verificationActionJournal,
    evidenceBundleDigest.value,
  );
  if (verificationAction !== null) return verificationAction;
  const chronology = validateChronology(
    enrollment,
    settlement,
    activation,
    processEvidence,
    closeoutState,
    evidenceBundle,
    verificationActionJournal,
  );
  if (chronology !== null) return chronology;
  return success({
    activation,
    processEvidence,
    closeoutState,
    evidenceBundle,
    verificationActionJournal,
    checkpointBindingDigest: closeoutState.checkpoint.bindingDigest,
    evidenceBundleDigest: evidenceBundleDigest.value,
  });
}

function validateIdentity(
  enrollment: PilotEnrollment,
  activation: CodingTaskSessionActivationRecord,
  processEvidence: AgentSessionProcessEvidence,
  closeoutState: CodingTaskSessionCloseoutState,
): Result<never, HarnessError> | null {
  if (
    activation.workspaceId !== enrollment.workspaceId ||
    activation.sessionId !== enrollment.sessionId ||
    activation.codingTaskId !== enrollment.codingTaskId ||
    activation.repositoryId !== enrollment.repositoryId
  ) {
    return invalid("Enrollment 与 Activation 身份不一致。");
  }
  if (
    processEvidence.workspaceId !== activation.workspaceId ||
    processEvidence.sessionId !== activation.sessionId ||
    processEvidence.codingTaskId !== activation.codingTaskId ||
    processEvidence.sourceTaskId !== activation.sourceTaskId ||
    processEvidence.attemptNumber !== activation.attemptNumber ||
    processEvidence.worktreeId !== activation.worktreeId ||
    processEvidence.worktreeRootDigest !== activation.worktreeRootDigest ||
    processEvidence.activationBindingDigest !== activation.bindingDigest
  ) {
    return invalid("Agent Process Evidence 与 Activation 身份不一致。");
  }
  if (
    closeoutState.status !== CodingTaskSessionCloseoutStatus.CheckpointBound ||
    closeoutState.workspaceId !== activation.workspaceId ||
    closeoutState.sessionId !== activation.sessionId ||
    closeoutState.codingTaskId !== activation.codingTaskId ||
    closeoutState.sourceTaskId !== activation.sourceTaskId ||
    closeoutState.repositoryId !== activation.repositoryId ||
    closeoutState.attemptNumber !== activation.attemptNumber ||
    closeoutState.activationBindingDigest !== activation.bindingDigest
  ) {
    return invalid("Closeout 未以相同 Session 身份停在 CheckpointBound。");
  }
  return null;
}

function validateVerificationAction(
  enrollment: PilotEnrollment,
  settlement: PilotSettlement,
  activation: CodingTaskSessionActivationRecord,
  journal: ActionJournalState,
  evidenceBundleDigest: ContentDigest,
): Result<never, HarnessError> | null {
  const intent = journal.intent;
  const latestObservation = journal.observations[journal.observations.length - 1];
  const latestResolution = journal.resolutions[journal.resolutions.length - 1];
  if (
    intent.workspaceId !== enrollment.workspaceId ||
    intent.taskId !== activation.sourceTaskId ||
    intent.actionId !== settlement.verificationActionId ||
    intent.kind !== ActionKind.CommandExecution ||
    intent.baseRevision !== enrollment.repositoryRevision
  ) {
    return invalid("Verification Action Journal 与 Enrollment 或 Activation 绑定不一致。");
  }
  if (
    ![ActionJournalStatus.Committed, ActionJournalStatus.Recovered].includes(journal.status) ||
    latestObservation === undefined ||
    latestResolution === undefined ||
    latestObservation.outcome !== ActionOutcome.Succeeded ||
    latestObservation.outputDigest !== evidenceBundleDigest
  ) {
    return invalid("Verification Action Journal 未证明目标 EvidenceBundle 已完成提交。");
  }
  return null;
}

function validateChronology(
  enrollment: PilotEnrollment,
  settlement: PilotSettlement,
  activation: CodingTaskSessionActivationRecord,
  processEvidence: AgentSessionProcessEvidence,
  closeoutState: CodingTaskSessionCloseoutState,
  evidenceBundle: EvidenceBundle,
  verificationActionJournal: ActionJournalState,
): Result<never, HarnessError> | null {
  const latestObservation =
    verificationActionJournal.observations[verificationActionJournal.observations.length - 1];
  if (latestObservation === undefined) {
    return invalid("Verification Action Journal 缺少完成时间证据。");
  }
  if (
    Date.parse(enrollment.enrolledAt) > Date.parse(activation.activatedAt) ||
    Date.parse(activation.activatedAt) > Date.parse(processEvidence.startedAt) ||
    Date.parse(processEvidence.startedAt) > Date.parse(processEvidence.completedAt) ||
    Date.parse(processEvidence.completedAt) > Date.parse(closeoutState.updatedAt) ||
    !hasMonotonicJournalChronology(
      verificationActionJournal,
      closeoutState.updatedAt,
      settlement.settledAt,
    ) ||
    Date.parse(verificationActionJournal.intent.recordedAt) >
      Date.parse(evidenceBundle.generatedAt) ||
    Date.parse(evidenceBundle.generatedAt) > Date.parse(latestObservation.recordedAt)
  ) {
    return invalid("Pilot Metrics 权威证据不满足 Session 生命周期时间偏序。");
  }
  return null;
}

function hasMonotonicJournalChronology(
  journal: ActionJournalState,
  earliestAt: string,
  latestAt: string,
): boolean {
  const records = [journal.intent, ...journal.observations, ...journal.resolutions].sort(
    (left, right) => left.sequence - right.sequence,
  );
  if (records.length !== journal.lastSequence) return false;
  let previousTime = Date.parse(earliestAt);
  const latestTime = Date.parse(latestAt);
  for (const [index, record] of records.entries()) {
    const currentTime = Date.parse(record.recordedAt);
    if (record.sequence !== index + 1 || currentTime < previousTime || currentTime > latestTime) {
      return false;
    }
    previousTime = currentTime;
  }
  return true;
}

function validateRevisionBinding(
  enrollment: PilotEnrollment,
  settlement: PilotSettlement,
  activation: CodingTaskSessionActivationRecord,
  closeoutState: CodingTaskSessionCloseoutState,
  evidenceBundle: EvidenceBundle,
): Result<never, HarnessError> | null {
  const snapshot = closeoutState.snapshot;
  const checkpoint = closeoutState.checkpoint;
  if (snapshot === null || checkpoint === null) {
    return invalid("CheckpointBound Closeout 缺少 Snapshot 或 Checkpoint。");
  }
  if (
    snapshot.repositoryId !== activation.repositoryId ||
    snapshot.worktreeId !== activation.worktreeId ||
    snapshot.baseRevision !== enrollment.repositoryRevision ||
    evidenceBundle.verificationRunId !== settlement.verificationRunId ||
    evidenceBundle.repositoryId !== activation.repositoryId ||
    evidenceBundle.worktreeId !== activation.worktreeId ||
    evidenceBundle.baseRevision !== snapshot.baseRevision ||
    evidenceBundle.targetRevision !== checkpoint.checkpoint.targetRevision
  ) {
    return invalid("EvidenceBundle 与 Closeout Revision 绑定不一致。");
  }
  return null;
}

function invalid(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, message));
}
