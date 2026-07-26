import type { SessionPostActionHookPayload } from "#application/hooks/index.js";
import {
  TraceDropReason,
  TraceWriteDisposition,
  type TraceSpanObservation,
  type TraceWriteOutcome,
} from "#application/observability/index.js";
import {
  ActionJournalMutationDisposition,
  PersistenceHealth,
  type ActionJournalLocator,
  type ActionJournalMutationOutput,
  type TraceObservationStore,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";

/** 构造 Session PostAction 的 Action Journal 定位键。 */
export function createSessionActionLocator(
  payload: SessionPostActionHookPayload,
): ActionJournalLocator {
  return {
    workspaceId: payload.workspaceId,
    taskId: payload.taskId,
    actionId: payload.actionId,
  };
}

/** Trace Store 违反不抛异常约定时降级为可审计的 Dropped 结果。 */
export async function recordSessionActionTraceSafely(
  traceStore: TraceObservationStore,
  observation: TraceSpanObservation,
): Promise<TraceWriteOutcome> {
  try {
    return await traceStore.record(observation);
  } catch {
    return {
      disposition: TraceWriteDisposition.Dropped,
      reason: TraceDropReason.IoFailure,
      recoveryPaths: [],
    };
  }
}

/** 仅接受本次新追加且持久化健康的 Action mutation。 */
export function isNewHealthyActionMutation(output: ActionJournalMutationOutput): boolean {
  return (
    output.disposition === ActionJournalMutationDisposition.Appended &&
    isHealthyActionMutation(output)
  );
}

/** 检查 Action mutation 的目录、锁与 Journal 是否全部健康。 */
export function isHealthyActionMutation(output: ActionJournalMutationOutput): boolean {
  return output.persistence?.overall === PersistenceHealth.Healthy;
}

/** 构造 Session Action 的稳定版本冲突。 */
export function sessionActionVersionConflict(
  actual: number,
  expected: number,
): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.VersionConflict, "Session Action Journal Version 已变化。", {
      actual: String(actual),
      expected: String(expected),
    }),
  );
}

/** 将已经开始的跨 Store 提交失败提升为不可自动重试的未知结果。 */
export function sessionAdmissionCommitUnknown(message: string, cause: HarnessError): HarnessError {
  return new HarnessError(
    HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown,
    message,
    { causeCode: cause.code },
    cause,
  );
}

/** Lease 释放失败时保留主操作结果分类，但以 Lock Unknown 为最终结果。 */
export function withSessionAdmissionOperationFailure<T>(
  releaseError: HarnessError,
  operation: Result<T, HarnessError>,
): HarnessError {
  return new HarnessError(
    releaseError.code,
    releaseError.message,
    {
      ...releaseError.details,
      operationStatus: operation.status,
      ...(operation.status === ResultStatus.Failure
        ? { operationErrorCode: operation.error.code }
        : {}),
    },
    releaseError,
  );
}

/** 将未分类异常收敛为稳定的 I/O Failure。 */
export function unexpectedSessionAdmissionFailure(message: string, cause: unknown): HarnessError {
  return new HarnessError(HarnessErrorCode.IoFailure, message, {}, cause);
}
