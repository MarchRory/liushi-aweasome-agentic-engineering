/** 一轮 Business Logic Human Battle 最多暴露的问题数量。 */
export const MAX_BUSINESS_LOGIC_HUMAN_QUESTIONS = 5;

/** Planning Review 确认幂等身份的版本。 */
export const PLAN_RISK_CONFIRMATION_SCHEMA_VERSION = "plan-risk.confirmation.v1";

/** Business Logic Proposal 内部幂等键前缀。 */
export const BUSINESS_LOGIC_PROPOSAL_IDEMPOTENCY_PREFIX =
  "plan-risk-confirm:business-logic:proposal:";

/** Business Logic G2 Approval 内部幂等键前缀。 */
export const BUSINESS_LOGIC_APPROVAL_IDEMPOTENCY_PREFIX =
  "plan-risk-confirm:business-logic:approval:";

/** PlanRisk Proposal 内部幂等键前缀。 */
export const PLAN_RISK_PROPOSAL_IDEMPOTENCY_PREFIX = "plan-risk-confirm:proposal:";

/** PlanRisk G4 Approval 内部幂等键前缀。 */
export const PLAN_RISK_APPROVAL_IDEMPOTENCY_PREFIX = "plan-risk-confirm:approval:";
