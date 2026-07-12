import type { Clock } from "#common/index.js";
import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionOutcome,
  ActionResolution,
  type ActionIntentRecord,
  type ActionObservationRecord,
  type ActionResolutionRecord,
} from "#domain/actionJournal/index.js";

import {
  JOURNALED_ACTION_FAILED_ERROR_CODE,
  JOURNALED_ACTION_UNKNOWN_ERROR_CODE,
} from "../constants/index.js";
import type { ActionExecutionResult } from "../contracts/index.js";

/** 将 Executor 结果转换为严格递增的 Action Observation。 */
export function createExecutionObservation(
  intent: ActionIntentRecord,
  sequence: number,
  execution: ActionExecutionResult,
  clock: Clock,
): ActionObservationRecord {
  const errorCode = resolveErrorCode(execution);
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Observation,
    actionId: intent.actionId,
    workspaceId: intent.workspaceId,
    taskId: intent.taskId,
    sequence,
    outcome: execution.outcome,
    evidenceIds: execution.evidenceIds,
    ...(execution.outputDigest === undefined ? {} : { outputDigest: execution.outputDigest }),
    ...(errorCode === undefined ? {} : { errorCode }),
    actor: intent.actor,
    recordedAt: clock.now().toISOString(),
  };
}

/** 根据 Observation 生成兼容且确定性的 Action Resolution。 */
export function createExecutionResolution(
  intent: ActionIntentRecord,
  sequence: number,
  outcome: ActionOutcome,
  clock: Clock,
): ActionResolutionRecord {
  const resolution = resolveResolution(outcome);
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Resolution,
    actionId: intent.actionId,
    workspaceId: intent.workspaceId,
    taskId: intent.taskId,
    sequence,
    resolution,
    reason: `Action Execution 将 ${outcome} 确定性映射为 ${resolution}。`,
    actor: intent.actor,
    recordedAt: clock.now().toISOString(),
  };
}

function resolveResolution(outcome: ActionOutcome): ActionResolution {
  switch (outcome) {
    case ActionOutcome.Succeeded:
      return ActionResolution.Committed;
    case ActionOutcome.NotApplied:
      return ActionResolution.RetryPermitted;
    case ActionOutcome.Failed:
    case ActionOutcome.OutcomeUnknown:
      return ActionResolution.HumanRequired;
  }
}

function resolveErrorCode(execution: ActionExecutionResult): string | undefined {
  if (execution.errorCode !== undefined) return execution.errorCode;
  if (execution.outcome === ActionOutcome.Failed) return JOURNALED_ACTION_FAILED_ERROR_CODE;
  if (execution.outcome === ActionOutcome.OutcomeUnknown) {
    return JOURNALED_ACTION_UNKNOWN_ERROR_CODE;
  }
  return undefined;
}
