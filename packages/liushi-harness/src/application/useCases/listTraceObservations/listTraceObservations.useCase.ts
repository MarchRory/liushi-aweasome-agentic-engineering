import {
  parseTraceId,
  type TraceQuery,
  type TraceQueryResult,
} from "#application/observability/index.js";
import type { TraceObservationStore } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { parseActionId } from "#domain/actionJournal/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

/** Task Trace 查询的不受信任输入。 */
export interface ListTraceObservationsInput {
  /** 工作区 Workspace ID。 */
  readonly workspaceId: string;
  /** 任务 Task ID。 */
  readonly taskId: string;
  /** 可选 Trace ID。 */
  readonly traceId?: string;
  /** 可选 Correlation ID。 */
  readonly correlationId?: string;
  /** 可选 Action ID。 */
  readonly actionId?: string;
}

/** 为 Tracker 和调试工具读取可丢失 Trace Observation。 */
export class ListTraceObservationsUseCase {
  public constructor(private readonly store: TraceObservationStore) {}

  /** 严格校验 Locator 与 Filter 后执行只读查询。 */
  public async execute(
    input: ListTraceObservationsInput,
  ): Promise<Result<TraceQueryResult, HarnessError>> {
    const query = parseQuery(input);
    return query.status === ResultStatus.Failure ? query : this.store.query(query.value);
  }
}

function parseQuery(input: ListTraceObservationsInput): Result<TraceQuery, HarnessError> {
  const workspaceId = parseWorkspaceId(input.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const taskId = parseTaskId(input.taskId);
  if (taskId.status === ResultStatus.Failure) return taskId;
  const traceId = input.traceId === undefined ? undefined : parseTraceId(input.traceId);
  if (traceId?.status === ResultStatus.Failure) return traceId;
  const actionId = input.actionId === undefined ? undefined : parseActionId(input.actionId);
  if (actionId?.status === ResultStatus.Failure) return actionId;
  const correlationId = input.correlationId?.trim();
  if (input.correlationId !== undefined && correlationId !== input.correlationId) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "correlationId 不能包含首尾空白。", {
        field: "correlationId",
      }),
    );
  }
  if (correlationId === "") {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "correlationId 不能为空。", {
        field: "correlationId",
      }),
    );
  }
  return success({
    workspaceId: workspaceId.value,
    taskId: taskId.value,
    ...(traceId === undefined ? {} : { traceId: traceId.value }),
    ...(actionId === undefined ? {} : { actionId: actionId.value }),
    ...(correlationId === undefined ? {} : { correlationId }),
  });
}
