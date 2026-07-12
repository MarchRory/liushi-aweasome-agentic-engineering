/** Trace Span 对应的工程操作类别。 */
export enum TraceOperationKind {
  /** Application Command 处理。 */
  Command = "command",
  /** Agent 推理或执行。 */
  Agent = "agent",
  /** 模型请求。 */
  Model = "model",
  /** Tool 调用。 */
  Tool = "tool",
  /** Harness 或 Coding Agent Hook。 */
  Hook = "hook",
  /** Validator 执行。 */
  Validator = "validator",
  /** Wiki、Ticket 或其他外部 Connector 调用。 */
  Connector = "connector",
}

/** 与 OpenTelemetry SpanKind 可直接映射的封闭类别。 */
export enum TraceSpanKind {
  /** 进程内部操作。 */
  Internal = "internal",
  /** 向外部系统发出的同步请求。 */
  Client = "client",
  /** 接收并处理的外部请求。 */
  Server = "server",
  /** 异步消息生产。 */
  Producer = "producer",
  /** 异步消息消费。 */
  Consumer = "consumer",
}

/** 与 OpenTelemetry StatusCode 可直接映射的 Span 结果。 */
export enum TraceStatusCode {
  /** 未显式设置结果。 */
  Unset = "unset",
  /** 操作成功。 */
  Ok = "ok",
  /** 操作失败。 */
  Error = "error",
}

/** Trace Sink 的非语义写入结果。 */
export enum TraceWriteDisposition {
  /** Observation 已追加到当前 Adapter。 */
  Persisted = "persisted",
  /** Observation 因观测链路故障被丢弃。 */
  Dropped = "dropped",
}

/** Trace Observation 被丢弃的稳定原因。 */
export enum TraceDropReason {
  /** 对应 Task 不存在。 */
  TaskUnavailable = "task_unavailable",
  /** Trace Lock 被其他写入者持有。 */
  Contended = "contended",
  /** Trace Adapter 发生输入输出故障。 */
  IoFailure = "io_failure",
}
