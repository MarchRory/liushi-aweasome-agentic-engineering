import { CONTENT_DIGEST_PATTERN } from "#common/index.js";

/** Artifact ID 使用的 uppercase ULID 格式。 */
export const ARTIFACT_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Artifact Digest 使用的通用带算法前缀 SHA-256 格式。 */
export const ARTIFACT_DIGEST_PATTERN = CONTENT_DIGEST_PATTERN;

/** Artifact Proposal 普通文本字段的最大字符数。 */
export const MAX_ARTIFACT_TEXT_LENGTH = 1_000;

/** Artifact Proposal 路径或资源定位字段的最大字符数。 */
export const MAX_ARTIFACT_PATH_LENGTH = 500;

/** Artifact Proposal 幂等键允许的最大字符数。 */
export const MAX_ARTIFACT_PROPOSAL_IDEMPOTENCY_KEY_LENGTH = 256;

/** 单个 Artifact 列表字段允许的最大条目数。 */
export const MAX_ARTIFACT_LIST_ITEMS = 100;

/** 当前切片创建 Artifact 时使用的首个 Revision。 */
export const FIRST_ARTIFACT_REVISION = 1;
