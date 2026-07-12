import type { HarnessError, Result } from "#common/index.js";
import type {
  TraceQuery,
  TraceQueryResult,
  TraceSpanObservation,
  TraceWriteOutcome,
} from "#application/observability/index.js";

/** 可替换的 Trace Observation 写入与查询 Port。 */
export interface TraceObservationStore {
  /** Best-effort 记录完成态 Span；观测故障通过 Dropped 返回，不抛出语义错误。 */
  record(observation: TraceSpanObservation): Promise<TraceWriteOutcome>;
  /** 查询 Task 范围内的 Trace Observation；不参与任何 Aggregate Replay。 */
  query(query: TraceQuery): Promise<Result<TraceQueryResult, HarnessError>>;
}
