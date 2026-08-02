/** PlanRisk 分析后等待 Human 处理的阶段。 */
export enum PlanRiskAnalysisStatus {
  /** 先确认现有业务行为及其计划改动。 */
  BusinessLogicReviewRequired = "business_logic_review_required",
  /** 确认技术方案、写入范围和风险。 */
  PlanRiskReviewRequired = "plan_risk_review_required",
}

/** PlanRisk Review Draft 的封闭类别。 */
export enum PlanRiskReviewKind {
  /** 历史业务逻辑契约 Review。 */
  BusinessLogic = "business_logic",
  /** 技术方案与风险 Review。 */
  PlanRisk = "plan_risk",
}

/** Human 确认 Planning Review 后的结果。 */
export enum PlanRiskConfirmationStatus {
  /** Review 已确认并完成对应 Artifact/Gate 持久化。 */
  Confirmed = "confirmed",
}

/** Planning Review 确认后的主线下一步。 */
export enum PlanRiskNextStep {
  /** G2 完成后重新生成绑定精确业务逻辑契约的 PlanRisk。 */
  ReanalyzePlanRisk = "reanalyze_plan_risk",
  /** PlanRisk 已允许进入 CodingTask。 */
  CodingTask = "coding_task",
}
