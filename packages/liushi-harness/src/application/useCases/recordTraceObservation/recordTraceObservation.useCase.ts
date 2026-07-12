import {
  TraceDropReason,
  TraceWriteDisposition,
  parseTraceSpanObservation,
  type TraceWriteOutcome,
} from "#application/observability/index.js";
import type { TraceObservationStore } from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";

/** 记录 Trace Observation 的不受信任输入。 */
export interface RecordTraceObservationInput {
  /** 完成态 Span Observation。 */
  readonly observation: unknown;
}

/** 校验并以 Best-effort 方式记录 Trace Observation。 */
export class RecordTraceObservationUseCase {
  public constructor(private readonly store: TraceObservationStore) {}

  /** 无效契约返回失败；Adapter 故障收敛为成功的 Dropped 结果。 */
  public async execute(
    input: RecordTraceObservationInput,
  ): Promise<Result<TraceWriteOutcome, HarnessError>> {
    const parsed = parseTraceSpanObservation(input.observation);
    if (parsed.status === ResultStatus.Failure) {
      return parsed;
    }
    try {
      return success(await this.store.record(parsed.value));
    } catch {
      return success({
        disposition: TraceWriteDisposition.Dropped,
        reason: TraceDropReason.IoFailure,
        recoveryPaths: [],
      });
    }
  }
}
