import type {
  SessionPostActionHookPayload,
  SessionPreActionHookPayload,
} from "#application/hooks/index.js";
import {
  TraceDropReason,
  TraceWriteDisposition,
  type TraceWriteOutcome,
} from "#application/observability/index.js";
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
import {
  SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
  MAX_SESSION_ACTION_RECOVERY_PATH_DIGESTS,
  ActionJournalRecordType,
  SessionActionTraceDisposition,
  SessionActionTraceDropReason,
  parseSessionActionIntent,
  parseSessionActionObservation,
  type SessionActionIntentRecord,
  type SessionActionObservationRecord,
  type SessionActionProvenance,
  type SessionActionTraceEvidence,
} from "#domain/actionJournal/index.js";

/** 从已授权 Session PreAction 创建严格 v2 Intent。 */
export function createSessionActionIntent(
  payload: SessionPreActionHookPayload,
  provenance: SessionActionProvenance,
): Result<SessionActionIntentRecord, HarnessError> {
  const targets = [...payload.targets].sort((left, right) => left.localeCompare(right));
  return parseSessionActionIntent({
    schemaVersion: SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
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
    target: JSON.stringify(targets),
    targets,
    inputDigest: payload.inputDigest,
    postconditionDigest: payload.postconditionDigest,
    ...(payload.baseRevision === undefined ? {} : { baseRevision: payload.baseRevision }),
    recoveryGuidance: payload.recoveryGuidance,
    sessionProvenance: provenance,
    actor: payload.actor,
    recordedAt: payload.occurredAt,
  });
}

/** 从已复验 Session PostAction 创建严格 v2 Observation。 */
export function createSessionActionObservation(
  payload: SessionPostActionHookPayload,
  intent: SessionActionIntentRecord,
  sequence: number,
  trace: SessionActionTraceEvidence,
): Result<SessionActionObservationRecord, HarnessError> {
  return parseSessionActionObservation({
    schemaVersion: SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Observation,
    actionId: payload.actionId,
    workspaceId: payload.workspaceId,
    taskId: payload.taskId,
    sequence,
    outcome: payload.outcome,
    evidenceIds: payload.evidenceIds,
    ...(payload.outputDigest === undefined ? {} : { outputDigest: payload.outputDigest }),
    ...(payload.errorCode === undefined ? {} : { errorCode: payload.errorCode }),
    sessionProvenance: intent.sessionProvenance,
    targets: intent.targets,
    trace,
    actor: payload.actor,
    recordedAt: payload.occurredAt,
  });
}

/** 将 best-effort Trace 写入结果转换为可审计且不含原始路径的领域证据。 */
export function createSessionActionTraceEvidence(
  outcome: TraceWriteOutcome,
  observationDigest: ContentDigest,
  digest: ContentDigestPort,
): Result<SessionActionTraceEvidence, HarnessError> {
  const recoveryPathDigests: ContentDigest[] = [];
  for (const path of outcome.recoveryPaths) {
    const pathDigest = digest.calculate({ recoveryPath: path });
    if (pathDigest.status === ResultStatus.Failure) return pathDigest;
    recoveryPathDigests.push(pathDigest.value);
  }
  const normalizedDigests = [...new Set(recoveryPathDigests)].sort((left, right) =>
    left.localeCompare(right),
  );
  if (normalizedDigests.length > MAX_SESSION_ACTION_RECOVERY_PATH_DIGESTS) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Trace 恢复路径摘要数量超过上限。"),
    );
  }
  if (outcome.disposition === TraceWriteDisposition.Persisted) {
    return success({
      observationDigest,
      disposition: SessionActionTraceDisposition.Persisted,
      recoveryPathDigests: normalizedDigests,
    });
  }
  if (outcome.reason === undefined) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Trace 被丢弃时必须提供稳定原因。"),
    );
  }
  return success({
    observationDigest,
    disposition: SessionActionTraceDisposition.Dropped,
    dropReason: mapTraceDropReason(outcome.reason),
    recoveryPathDigests: normalizedDigests,
  });
}

function mapTraceDropReason(reason: TraceDropReason): SessionActionTraceDropReason {
  switch (reason) {
    case TraceDropReason.TaskUnavailable:
      return SessionActionTraceDropReason.TaskUnavailable;
    case TraceDropReason.Contended:
      return SessionActionTraceDropReason.Contended;
    case TraceDropReason.IoFailure:
      return SessionActionTraceDropReason.IoFailure;
  }
}
