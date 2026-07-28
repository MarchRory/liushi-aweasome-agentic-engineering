/** Verification Completion Tail 的稳定阶段。 */
export enum CodingTaskVerificationCompletionStage {
  /** 执行版本化 Verification Command。 */
  Verification = "verification",
  /** 强一致读取并复验 EvidenceBundle。 */
  Evidence = "evidence",
  /** 从权威状态装配 PR-ready Artifact。 */
  PrReady = "pr_ready",
}

/** Verification Command 到 PR-ready 的封闭完成结果。 */
export enum CodingTaskVerificationCompletionStatus {
  /** Verification Evidence 已通过并形成 PR-ready Artifact。 */
  ReviewReady = "review_ready",
  /** Verification Command 被确定性拒绝或发生版本冲突。 */
  CommandBlocked = "command_blocked",
  /** Verification Command 的副作用或持久化结果未知。 */
  OutcomeUnknown = "outcome_unknown",
  /** Verification 已执行，但存在失败检查。 */
  VerificationFailed = "verification_failed",
  /** Verification 因环境或能力缺失而未完整执行。 */
  VerificationBlocked = "verification_blocked",
  /** Evidence 声明 Human Waiver；当前自动交付链不接纳。 */
  VerificationWaived = "verification_waived",
}
