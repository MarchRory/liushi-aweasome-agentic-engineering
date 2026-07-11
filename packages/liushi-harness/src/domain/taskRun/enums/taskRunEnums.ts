/** Task 当前运行聚合已经完成的确定性检查点。 */
export enum TaskCheckpoint {
  /** TaskCreated Event 已提交。 */
  TaskCreated = "task_created",
  /** Requirement Artifact 已提交并等待 G1。 */
  RequirementProposed = "requirement_proposed",
  /** Requirement 对应 G1 Approval 已满足。 */
  RequirementApproved = "requirement_approved",
  /** Business Logic Artifact 已提交并等待 G2。 */
  BusinessLogicProposed = "business_logic_proposed",
  /** Business Logic 对应 G2 Approval 已满足。 */
  BusinessLogicApproved = "business_logic_approved",
  /** PlanRisk Artifact 已提交并等待 G4。 */
  PlanProposed = "plan_proposed",
  /** PlanRisk 已满足全部 Gate，可以进入实现。 */
  ImplementationReady = "implementation_ready",
}

/** TaskCreated 之后由 Task Run Event Store 支持的事件类别。 */
export enum TaskRunEventType {
  /** 一个正式 Artifact Revision 已提交。 */
  ArtifactCommitted = "artifact_committed",
  /** 一个 Human Approval Record 已提交。 */
  ApprovalRecorded = "approval_recorded",
}
