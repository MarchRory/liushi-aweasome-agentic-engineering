/** 权威审批回执的契约版本。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_VERIFICATION_RECEIPT_SCHEMA_VERSION =
  "liushi.executor-compatibility-release-approval-verification-receipt.v1" as const;

/** Authority 标识允许的最小长度。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_ID_MIN_LENGTH = 1;

/** Authority 标识允许的最大长度。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_ID_MAX_LENGTH = 64;

/** Authority 与 Evidence 标识使用的 ASCII 安全字符。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;

/** 权威证据标识允许的最大长度。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_EVIDENCE_ID_MAX_LENGTH = 128;

/** 权威标识长度与字符约束。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_EVIDENCE_ID_PATTERN =
  /^[A-Za-z0-9._-]+$/u;
