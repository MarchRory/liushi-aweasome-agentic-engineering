/** Gate Evaluation 使用的稳定原因代码。 */
export enum GateReason {
  /** Artifact 状态不允许作为当前 Gate 输入。 */
  ArtifactStatusNotProposed = "artifact_status_not_proposed",
  /** 当前风险等级由 Hard Invariant 禁止。 */
  RiskLevelForbidden = "risk_level_forbidden",
  /** 当前 Artifact 不需要额外 Human Approval。 */
  ApprovalNotRequired = "approval_not_required",
  /** 至少一个所需 Human Approval 尚未满足。 */
  RequiredApprovalMissing = "required_approval_missing",
  /** 全部所需 Human Approval 均精确匹配。 */
  RequiredApprovalSatisfied = "required_approval_satisfied",
}
