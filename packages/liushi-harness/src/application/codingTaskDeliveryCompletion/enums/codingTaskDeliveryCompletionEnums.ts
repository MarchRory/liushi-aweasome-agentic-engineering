/** Session Delivery 到 PR-ready 的稳定执行阶段。 */
export enum CodingTaskDeliveryCompletionStage {
  /** 接纳 Effective Closeout。 */
  Delivery = "delivery",
  /** 从权威 G8 Artifact 重新编译 Project Profile。 */
  ProfileCompilation = "profile_compilation",
  /** 解析当前需求的 Applicable Rule Bundle。 */
  RuleResolution = "rule_resolution",
  /** 从 Profile、Rule 与 CodingTask 选择权威 Verification Plan。 */
  PlanSelection = "plan_selection",
  /** 解析受信 Repository Root 并校验 Worktree Runtime。 */
  RuntimeBinding = "runtime_binding",
  /** 执行版本化 Verification Command。 */
  Verification = "verification",
  /** 读取并复验 EvidenceBundle。 */
  Evidence = "evidence",
  /** 装配 PR-ready Artifact。 */
  PrReady = "pr_ready",
}

/** Session Delivery 到 PR-ready 的封闭业务结果。 */
export enum CodingTaskDeliveryCompletionStatus {
  /** 全部必需 Verification 已通过，可进入 Human Review。 */
  ReviewReady = "review_ready",
  /** 确定性前置条件、Command 或 Plan 选择阻止继续。 */
  Blocked = "blocked",
  /** 副作用或持久化结果未知，禁止自动重试。 */
  OutcomeUnknown = "outcome_unknown",
  /** Verification 已执行，但存在失败检查。 */
  VerificationFailed = "verification_failed",
  /** Verification 因环境或能力缺失而未完整执行。 */
  VerificationBlocked = "verification_blocked",
  /** Evidence 声明 Human Waiver；当前自动交付链不接纳。 */
  VerificationWaived = "verification_waived",
}
