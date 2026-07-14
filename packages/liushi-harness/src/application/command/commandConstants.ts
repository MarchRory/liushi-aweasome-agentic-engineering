/** Command Envelope 的当前 Schema 版本。 */
export const COMMAND_ENVELOPE_SCHEMA_VERSION = "1.0.0";

/** Command Receipt 的当前 Schema 版本。 */
export const COMMAND_RECEIPT_SCHEMA_VERSION = "1.0.0";

/** Command Invocation Provenance 的当前 Schema 版本。 */
export const COMMAND_INVOCATION_PROVENANCE_SCHEMA_VERSION = "1.0.0";

/** Command 标识允许的最大长度。 */
export const MAX_COMMAND_ID_LENGTH = 128;

/** Command Type 允许的最大长度。 */
export const MAX_COMMAND_TYPE_LENGTH = 160;

/** Aggregate Type 允许的最大长度。 */
export const MAX_AGGREGATE_TYPE_LENGTH = 160;

/** Aggregate 标识允许的最大长度。 */
export const MAX_AGGREGATE_ID_LENGTH = 256;

/** 幂等键允许的最大长度。 */
export const MAX_COMMAND_IDEMPOTENCY_KEY_LENGTH = 256;

/** 关联标识允许的最大长度。 */
export const MAX_COMMAND_TRACE_ID_LENGTH = 128;

/** Command 执行器名称允许的最大长度。 */
export const MAX_COMMAND_PROVENANCE_EXECUTOR_LENGTH = 160;

/** Command 工具名称允许的最大长度。 */
export const MAX_COMMAND_PROVENANCE_TOOL_NAME_LENGTH = 160;

/** 授权上下文键允许的最大数量。 */
export const MAX_AUTHORIZATION_CONTEXT_KEYS = 64;
