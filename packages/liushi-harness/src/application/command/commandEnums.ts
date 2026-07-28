/** Command Receipt 的业务结果状态。 */
export enum CommandStatus {
  /** Command 已提交并产生了确定的聚合版本。 */
  Committed = "committed",
  /** Command 因业务、权限或输入规则被拒绝。 */
  Rejected = "rejected",
  /** Command 因期望版本与当前版本不一致而产生冲突。 */
  Conflict = "conflict",
  /** Command 与同幂等键下已提交成功的首次请求重复。 */
  Duplicate = "duplicate",
  /** 无法确定 Event 或外部副作用是否已经完成。 */
  OutcomeUnknown = "outcome_unknown",
}

/** Command Receipt 的稳定错误分类。 */
export enum CommandErrorCode {
  /** Command Envelope 结构不完整或包含不支持的字段。 */
  InvalidEnvelope = "invalid_envelope",
  /** Command Envelope 或 Receipt 的 Schema 版本不受支持。 */
  UnsupportedSchemaVersion = "unsupported_schema_version",
  /** Command ID 无效。 */
  InvalidCommandId = "invalid_command_id",
  /** Command Type 无效。 */
  InvalidCommandType = "invalid_command_type",
  /** Aggregate Type 无效。 */
  InvalidAggregateType = "invalid_aggregate_type",
  /** Aggregate ID 无效。 */
  InvalidAggregateId = "invalid_aggregate_id",
  /** 期望版本不是非负整数。 */
  InvalidExpectedVersion = "invalid_expected_version",
  /** 幂等键无效。 */
  InvalidIdempotencyKey = "invalid_idempotency_key",
  /** Request Digest 不是受支持的摘要格式。 */
  InvalidRequestDigest = "invalid_request_digest",
  /** Actor 引用无效。 */
  InvalidActor = "invalid_actor",
  /** Authorization Context 无效。 */
  InvalidAuthorizationContext = "invalid_authorization_context",
  /** Correlation ID 无效。 */
  InvalidCorrelationId = "invalid_correlation_id",
  /** Causation ID 无效。 */
  InvalidCausationId = "invalid_causation_id",
  /** Submitted At 无效。 */
  InvalidSubmittedAt = "invalid_submitted_at",
  /** Payload 无效。 */
  InvalidPayload = "invalid_payload",
  /** Command 的确定性执行前置条件尚未满足。 */
  PreconditionNotMet = "precondition_not_met",
  /** Command 未获得执行所需的授权。 */
  AuthorizationDenied = "authorization_denied",
  /** Command 在执行前因资源或 Lock 被占用而未执行，可显式重试。 */
  ResourceUnavailable = "resource_unavailable",
  /** Aggregate 当前版本与 Command 的期望版本不一致。 */
  VersionConflict = "version_conflict",
  /** 同一幂等键对应了不同的 Request Digest。 */
  IdempotencyConflict = "idempotency_conflict",
  /** 无法确认副作用最终结果。 */
  OutcomeUnknown = "outcome_unknown",
}

/** Receipt 状态的语义别名，便于按 CommandReceipt 命名使用。 */
export { CommandStatus as CommandReceiptStatus };
