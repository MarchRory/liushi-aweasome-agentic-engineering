/** Artifact Payload 的封闭类型集合。 */
export enum ArtifactType {
  /** 需求契约 Artifact。 */
  RequirementContract = "requirement_contract",
  /** 业务逻辑变更契约 Artifact。 */
  BusinessLogicChangeContract = "business_logic_change_contract",
  /** 计划与风险 Artifact。 */
  PlanRisk = "plan_risk",
  /** 人工 Project Profile 晋升提案 Artifact。 */
  ProjectProfileProposal = "project_profile_proposal",
}

/** Artifact 生命周期状态的封闭集合。 */
export enum ArtifactStatus {
  /** Artifact 仍在编辑，不能作为 Gate 或执行依据。 */
  Draft = "draft",
  /** Artifact 已提出但尚未被接受。 */
  Proposed = "proposed",
  /** Artifact 对应 Digest 已获得所需 Human Approval。 */
  Approved = "approved",
  /** Artifact 已被明确拒绝。 */
  Rejected = "rejected",
  /** Artifact 已被后续 Artifact 替代。 */
  Superseded = "superseded",
}
