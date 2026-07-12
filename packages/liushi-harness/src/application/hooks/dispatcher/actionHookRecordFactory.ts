import {
  TRACE_OBSERVATION_SCHEMA_VERSION,
  TraceOperationKind,
  TraceSpanKind,
  TraceStatusCode,
  type TraceSpanObservation,
} from "#application/observability/index.js";
import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionOutcome,
  ActionResolution,
  type ActionIntentRecord,
  type ActionObservationRecord,
  type ActionResolutionRecord,
} from "#domain/actionJournal/index.js";

import type { PostActionHookPayload, PreActionHookPayload } from "../contracts/index.js";

/** 根据 PreAction 构造不可变的 Action Intent 记录。 */
export function createActionIntent(payload: PreActionHookPayload): ActionIntentRecord {
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Intent,
    actionId: payload.actionId,
    sequence: 1,
    workspaceId: payload.workspaceId,
    taskId: payload.taskId,
    commandId: payload.commandId,
    correlationId: payload.correlationId,
    ...(payload.causationId === undefined ? {} : { causationId: payload.causationId }),
    idempotencyKey: payload.idempotencyKey,
    kind: payload.actionKind,
    target: JSON.stringify(payload.targets),
    inputDigest: payload.inputDigest,
    postconditionDigest: payload.postconditionDigest,
    ...(payload.baseRevision === undefined ? {} : { baseRevision: payload.baseRevision }),
    recoveryGuidance: payload.recoveryGuidance,
    actor: payload.actor,
    recordedAt: payload.occurredAt,
  };
}

/** 根据 PostAction 构造 Action Observation 记录。 */
export function createActionObservation(
  payload: PostActionHookPayload,
  sequence: number,
): ActionObservationRecord {
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Observation,
    actionId: payload.actionId,
    workspaceId: payload.workspaceId,
    taskId: payload.taskId,
    sequence,
    outcome: payload.outcome,
    evidenceIds: payload.evidenceIds,
    ...(payload.outputDigest === undefined ? {} : { outputDigest: payload.outputDigest }),
    ...(payload.errorCode === undefined ? {} : { errorCode: payload.errorCode }),
    actor: payload.actor,
    recordedAt: payload.occurredAt,
  };
}

/** 根据 PostAction 构造确定性的 Action Resolution 记录。 */
export function createActionResolution(
  payload: PostActionHookPayload,
  sequence: number,
): ActionResolutionRecord {
  const resolution = resolveActionOutcome(payload.outcome);
  return {
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Resolution,
    actionId: payload.actionId,
    workspaceId: payload.workspaceId,
    taskId: payload.taskId,
    sequence,
    resolution,
    reason: `PostAction 将 ${payload.outcome} 确定性映射为 ${resolution}。`,
    actor: payload.actor,
    recordedAt: payload.occurredAt,
  };
}

/** 将 PostAction 映射为可丢失的 Trace Observation。 */
export function createActionTrace(payload: PostActionHookPayload): TraceSpanObservation {
  const status = resolveTraceStatus(payload.outcome);
  return {
    schemaVersion: TRACE_OBSERVATION_SCHEMA_VERSION,
    traceId: payload.traceId,
    spanId: payload.spanId,
    ...(payload.parentSpanId === undefined ? {} : { parentSpanId: payload.parentSpanId }),
    workspaceId: payload.workspaceId,
    taskId: payload.taskId,
    commandId: payload.commandId,
    correlationId: payload.correlationId,
    ...(payload.causationId === undefined ? {} : { causationId: payload.causationId }),
    actionId: payload.actionId,
    actor: payload.actor,
    operationKind: TraceOperationKind.Tool,
    operationName: payload.toolName,
    spanKind: TraceSpanKind.Client,
    status,
    ...(status === TraceStatusCode.Error ? { errorType: payload.errorCode ?? "unknown" } : {}),
    startedAt: payload.startedAt,
    endedAt: payload.endedAt,
    tool: { toolName: payload.toolName, toolCallId: payload.toolCallId },
  };
}

function resolveActionOutcome(outcome: ActionOutcome): ActionResolution {
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

function resolveTraceStatus(outcome: ActionOutcome): TraceStatusCode {
  switch (outcome) {
    case ActionOutcome.Succeeded:
      return TraceStatusCode.Ok;
    case ActionOutcome.NotApplied:
      return TraceStatusCode.Unset;
    case ActionOutcome.Failed:
    case ActionOutcome.OutcomeUnknown:
      return TraceStatusCode.Error;
  }
}
