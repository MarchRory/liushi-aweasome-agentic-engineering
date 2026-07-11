/** RecordApproval 调用是否产生了新的持久化事件。 */
export enum ApprovalRecordDisposition {
  /** 本次调用提交了新的 ApprovalRecorded Event。 */
  Recorded = "recorded",
  /** 本次调用命中了完全相同的既有幂等记录。 */
  Reused = "reused",
}
