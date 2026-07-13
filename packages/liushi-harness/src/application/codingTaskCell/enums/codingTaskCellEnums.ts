/** CodingTask Cell 固定纵向执行阶段。 */
export enum CodingTaskCellStage {
  /** 创建已经获得 Human Gate 授权的 CodingTask。 */
  Create = "create",
  /** 创建受管 Worktree。 */
  Provision = "provision",
  /** 开始编码 Attempt。 */
  StartAttempt = "start_attempt",
  /** 应用一批受控文件变更。 */
  Implementation = "implementation",
  /** 创建 Git Checkpoint 并提交实现。 */
  Submission = "submission",
  /** 执行 Verification Plan。 */
  Verification = "verification",
  /** 强一致读取最终 EvidenceBundle。 */
  Evidence = "evidence",
  /** 从权威 CodingTask、Task Artifact 与 Evidence 组装 PR-ready Artifact。 */
  PrReady = "pr_ready",
}

/** CodingTask Cell 的封闭业务结果。 */
export enum CodingTaskCellStatus {
  /** Verification Evidence 已通过，可进入人工 Review。 */
  ReviewReady = "review_ready",
  /** 确定性拒绝、冲突或未通过 Verification 阻止继续。 */
  Blocked = "blocked",
  /** 副作用或持久化结果未知，禁止自动重试。 */
  OutcomeUnknown = "outcome_unknown",
}
