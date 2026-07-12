/** Action Journal Record 的当前 Schema 版本。 */
export const ACTION_JOURNAL_SCHEMA_VERSION = "1.0.0";

/** Action ID 使用的 ULID 格式。 */
export const ACTION_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Action 幂等键允许的最大长度。 */
export const MAX_ACTION_IDEMPOTENCY_KEY_LENGTH = 256;

/** Action 目标资源描述允许的最大长度。 */
export const MAX_ACTION_TARGET_LENGTH = 2_000;

/** Action 恢复说明允许的最大长度。 */
export const MAX_ACTION_RECOVERY_GUIDANCE_LENGTH = 4_000;

/** Action Observation 错误码允许的最大长度。 */
export const MAX_ACTION_ERROR_CODE_LENGTH = 160;

/** Action Resolution 原因允许的最大长度。 */
export const MAX_ACTION_RESOLUTION_REASON_LENGTH = 4_000;
