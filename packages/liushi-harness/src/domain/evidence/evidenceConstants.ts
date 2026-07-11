/** Evidence 与 Claim 标识符允许的最大字符数。 */
export const MAX_EVIDENCE_ID_LENGTH = 80;

/** Evidence 来源定位字段允许的最大字符数。 */
export const MAX_EVIDENCE_LOCATOR_LENGTH = 500;

/** Evidence Revision 允许的最大字符数。 */
export const MAX_EVIDENCE_REVISION_LENGTH = 500;

/** Evidence 内容摘要使用的带算法前缀 SHA-256 格式。 */
export const EVIDENCE_CONTENT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

/** Evidence 标题允许的最大字符数。 */
export const MAX_EVIDENCE_TITLE_LENGTH = 200;

/** Claim 文本允许的最大字符数。 */
export const MAX_CLAIM_STATEMENT_LENGTH = 1000;
