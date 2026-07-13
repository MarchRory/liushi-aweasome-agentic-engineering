import type { Clock, ActorRef } from "#common/index.js";
import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionOutcome,
  ActionResolution,
  type ActionJournalState,
  type ActionObservationRecord,
  type ActionResolutionRecord,
} from "#domain/actionJournal/index.js";
import { WorktreeProvisionRecoveryInspectionStatus } from "#application/ports/index.js";

import type { WorktreeProvisionRecoveryAssessment } from "../contracts/index.js";

/** 为尚未处置的已有 Observation 创建兼容 Resolution。 */
export function createExistingProvisionResolution(
  state: ActionJournalState,
  actor: ActorRef,
  clock: Clock,
): ActionResolutionRecord | undefined {
  const latest = state.observations.at(-1);
  if (latest === undefined) return undefined;
  return createResolutionRecord(
    state,
    resolutionForOutcome(latest.outcome),
    "Human 已触发 Worktree Provision 恢复并补全既有 Observation。",
    actor,
    clock,
  );
}

/** 将只读恢复评估投影为不可变 Observation。 */
export function createProvisionRecoveryObservation(
  state: ActionJournalState,
  assessment: WorktreeProvisionRecoveryAssessment,
  actor: ActorRef,
  clock: Clock,
): ActionObservationRecord {
  const outcome = outcomeForAssessment(assessment.status);
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Observation,
    actionId: state.intent.actionId,
    workspaceId: state.intent.workspaceId,
    taskId: state.intent.taskId,
    sequence: state.lastSequence + 1,
    outcome,
    evidenceIds: assessment.evidenceIds,
    outputDigest: assessment.digest,
    ...(outcome === ActionOutcome.OutcomeUnknown ? { errorCode: assessment.status } : {}),
    actor,
    recordedAt: clock.now().toISOString(),
  };
}

/** 为最新恢复 Observation 创建确定性 Resolution。 */
export function createProvisionRecoveryResolution(
  state: ActionJournalState,
  assessment: WorktreeProvisionRecoveryAssessment,
  actor: ActorRef,
  clock: Clock,
): ActionResolutionRecord {
  const resolution = resolutionForAssessment(assessment.status);
  return createResolutionRecord(
    state,
    resolution,
    reasonForAssessment(assessment.status),
    actor,
    clock,
  );
}

function createResolutionRecord(
  state: ActionJournalState,
  resolution: ActionResolution,
  reason: string,
  actor: ActorRef,
  clock: Clock,
): ActionResolutionRecord {
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Resolution,
    actionId: state.intent.actionId,
    workspaceId: state.intent.workspaceId,
    taskId: state.intent.taskId,
    sequence: state.lastSequence + 1,
    resolution,
    reason,
    actor,
    recordedAt: clock.now().toISOString(),
  };
}

function outcomeForAssessment(status: WorktreeProvisionRecoveryInspectionStatus): ActionOutcome {
  switch (status) {
    case WorktreeProvisionRecoveryInspectionStatus.Applied:
      return ActionOutcome.Succeeded;
    case WorktreeProvisionRecoveryInspectionStatus.NotApplied:
      return ActionOutcome.NotApplied;
    case WorktreeProvisionRecoveryInspectionStatus.HumanRequired:
    case WorktreeProvisionRecoveryInspectionStatus.Unavailable:
      return ActionOutcome.OutcomeUnknown;
  }
}

function resolutionForAssessment(
  status: WorktreeProvisionRecoveryInspectionStatus,
): ActionResolution {
  return resolutionForOutcome(outcomeForAssessment(status));
}

function resolutionForOutcome(outcome: ActionOutcome): ActionResolution {
  switch (outcome) {
    case ActionOutcome.Succeeded:
      return ActionResolution.Recovered;
    case ActionOutcome.NotApplied:
      return ActionResolution.RetryPermitted;
    case ActionOutcome.Failed:
    case ActionOutcome.OutcomeUnknown:
      return ActionResolution.HumanRequired;
  }
}

function reasonForAssessment(status: WorktreeProvisionRecoveryInspectionStatus): string {
  switch (status) {
    case WorktreeProvisionRecoveryInspectionStatus.Applied:
      return "只读证据证明 Worktree Provision 后置条件已经满足。";
    case WorktreeProvisionRecoveryInspectionStatus.NotApplied:
      return "只读证据证明路径、Registry 与分支均未产生副作用。";
    case WorktreeProvisionRecoveryInspectionStatus.HumanRequired:
      return "现场存在冲突或 Human 修改，继续等待 Human 处理。";
    case WorktreeProvisionRecoveryInspectionStatus.Unavailable:
      return "当前无法取得完整只读证据，继续等待 Human 处理。";
  }
}
