import type { ActorRef } from "#common/index.js";
import type { ActionId } from "#domain/actionJournal/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { TRACE_OBSERVATION_SCHEMA_VERSION } from "../constants/index.js";
import type {
  TraceDropReason,
  TraceOperationKind,
  TraceSpanKind,
  TraceStatusCode,
  TraceWriteDisposition,
} from "../enums/index.js";
import type { SpanId, TraceId } from "../identity/index.js";

/** 模型 Span 的稳定身份与可选使用量。 */
export interface TraceModelUsage {
  /** 模型 Provider。 */
  readonly provider: string;
  /** Provider 内的模型标识。 */
  readonly modelId: string;
  /** 输入 Token 数。 */
  readonly inputTokens?: number;
  /** 输出 Token 数。 */
  readonly outputTokens?: number;
  /** 命中缓存的输入 Token 数。 */
  readonly cachedInputTokens?: number;
  /** 推理 Token 数。 */
  readonly reasoningTokens?: number;
  /** Provider 报告或 Harness 计算的美元成本字符串。 */
  readonly costUsd?: string;
}

/** Tool Span 的稳定调用身份。 */
export interface TraceToolCall {
  /** 注册后的 Tool 名称。 */
  readonly toolName: string;
  /** Executor 生成的 Tool Call ID。 */
  readonly toolCallId: string;
}

/** 一次完成态 Span 的不可变 Trace Observation。 */
export interface TraceSpanObservation {
  /** Trace 契约版本。 */
  readonly schemaVersion: typeof TRACE_OBSERVATION_SCHEMA_VERSION;
  /** 跨进程传播的 Trace ID。 */
  readonly traceId: TraceId;
  /** 当前 Span ID。 */
  readonly spanId: SpanId;
  /** 父 Span ID；Root Span 省略。 */
  readonly parentSpanId?: SpanId;
  /** 当前 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** 当前 Task。 */
  readonly taskId: TaskId;
  /** 产生该 Span 的 Application Command。 */
  readonly commandId: string;
  /** 贯穿需求交付链路的 Correlation ID。 */
  readonly correlationId: string;
  /** 直接触发当前操作的 Causation ID。 */
  readonly causationId?: string;
  /** 当前 Span 对应副作用时关联的 Action ID。 */
  readonly actionId?: ActionId;
  /** 产生 Observation 的 Actor。 */
  readonly actor: ActorRef;
  /** 工程操作类别。 */
  readonly operationKind: TraceOperationKind;
  /** 稳定、低基数的 Operation 名称。 */
  readonly operationName: string;
  /** OpenTelemetry 兼容的 Span Kind。 */
  readonly spanKind: TraceSpanKind;
  /** Span 结果。 */
  readonly status: TraceStatusCode;
  /** Error Span 的稳定错误类别。 */
  readonly errorType?: string;
  /** Span 开始时间。 */
  readonly startedAt: string;
  /** Span 结束时间。 */
  readonly endedAt: string;
  /** Model Span 的模型与使用量。 */
  readonly model?: TraceModelUsage;
  /** Tool Span 的调用身份。 */
  readonly tool?: TraceToolCall;
}

/** Trace Sink 写入结果；该结果不得改变业务语义状态。 */
export interface TraceWriteOutcome {
  /** Observation 是否被 Adapter 保存。 */
  readonly disposition: TraceWriteDisposition;
  /** 丢弃时的稳定原因。 */
  readonly reason?: TraceDropReason;
  /** 需要运维清理的本地路径；不包含业务 Payload。 */
  readonly recoveryPaths: readonly string[];
}

/** Task 级 Trace 查询条件。 */
export interface TraceQuery {
  /** 查询 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** 查询 Task。 */
  readonly taskId: TaskId;
  /** 可选 Trace ID 过滤。 */
  readonly traceId?: TraceId;
  /** 可选 Correlation ID 过滤。 */
  readonly correlationId?: string;
  /** 可选 Action ID 过滤。 */
  readonly actionId?: ActionId;
}

/** 可丢失 Trace Store 的只读结果。 */
export interface TraceQueryResult {
  /** 按开始时间和 Span ID 稳定排序的有效 Observation。 */
  readonly observations: readonly TraceSpanObservation[];
  /** 因损坏或不兼容而跳过的记录数。 */
  readonly skippedRecordCount: number;
}
