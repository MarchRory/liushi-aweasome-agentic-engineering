/** Requirement 分析完成后的 Human 处理状态。 */
export enum RequirementAnalysisStatus {
  /** Proposal 已生成，仍需 Human 做最终语义审阅。 */
  ReadyForReview = "ready_for_review",
  /** Proposal 包含必须由 Human 回答的业务问题。 */
  HumanBattleRequired = "human_battle_required",
}

/** Requirement Human 确认结果。 */
export enum RequirementConfirmationStatus {
  /** Requirement Artifact 与 G1 Approval 均已持久化或幂等复用。 */
  Confirmed = "confirmed",
}

/** Requirement 确认后的固定主线步骤。 */
export enum RequirementNextStep {
  /** 基于获批 Requirement 生成技术方案与风险。 */
  PlanRisk = "plan_risk",
}
