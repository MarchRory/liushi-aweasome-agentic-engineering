/** Tracker Task Timeline 条目的封闭事件类别集合。 */
export enum TaskTimelineEntryKind {
  /** Task 已创建。 */
  TaskCreated = "task_created",
  /** Artifact Revision 已提交。 */
  ArtifactCommitted = "artifact_committed",
  /** Human Approval 已记录。 */
  ApprovalRecorded = "approval_recorded",
}
