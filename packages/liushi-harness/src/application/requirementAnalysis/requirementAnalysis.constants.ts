/** 一轮 Human Battle 最多暴露的高影响问题数量。 */
export const MAX_REQUIREMENT_HUMAN_QUESTIONS = 5;

/** Requirement 确认幂等身份的版本。 */
export const REQUIREMENT_CONFIRMATION_SCHEMA_VERSION = "requirement.confirmation.v1";

/** Requirement Proposal 内部幂等键前缀。 */
export const REQUIREMENT_PROPOSAL_IDEMPOTENCY_PREFIX = "requirement-confirm:proposal:";

/** Requirement G1 Approval 内部幂等键前缀。 */
export const REQUIREMENT_APPROVAL_IDEMPOTENCY_PREFIX = "requirement-confirm:approval:";
