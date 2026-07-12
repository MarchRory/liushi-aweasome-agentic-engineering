/** VerificationPlan 的 Schema 版本。 */
export const VERIFICATION_PLAN_SCHEMA_VERSION = 1 as const;

/** EvidenceBundle 的 Schema 版本。 */
export const EVIDENCE_BUNDLE_SCHEMA_VERSION = 1 as const;

/** 验证证据在 Harness 内的稳定来源标识。 */
export const VERIFICATION_EVIDENCE_SOURCE = "liushi-harness.verification" as const;

/** Verification 标识符允许的最大字符数。 */
export const MAX_VERIFICATION_IDENTIFIER_LENGTH = 128;

/** Verification 命令可执行文件名允许的最大字符数。 */
export const MAX_VERIFICATION_EXECUTABLE_LENGTH = 256;

/** Verification 命令参数的最大数量。 */
export const MAX_VERIFICATION_ARGUMENT_COUNT = 128;

/** 单条 Verification 命令允许的最大超时时间。 */
export const MAX_VERIFICATION_TIMEOUT_MS = 86_400_000;
