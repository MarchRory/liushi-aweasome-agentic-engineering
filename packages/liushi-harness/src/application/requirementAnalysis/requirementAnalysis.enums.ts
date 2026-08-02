/** Requirement 分析完成后的 Human 处理状态。 */
export enum RequirementAnalysisStatus {
  /** Proposal 已生成，仍需 Human 做最终语义审阅。 */
  ReadyForReview = "ready_for_review",
  /** Proposal 包含必须由 Human 回答的业务问题。 */
  HumanBattleRequired = "human_battle_required",
}
