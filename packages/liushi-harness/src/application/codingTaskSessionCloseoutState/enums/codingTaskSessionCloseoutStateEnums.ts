/** Closeout Process State 的生命周期状态。 */
export enum CodingTaskSessionCloseoutStatus {
  /** 已创建但尚未持久化提交前 Snapshot。 */
  Closing = "closing",
  /** 提交前 Snapshot 与 Action Evidence 已绑定。 */
  SnapshotPersisted = "snapshot_persisted",
  /** ChangeSet Checkpoint 已与 Snapshot 双向绑定。 */
  CheckpointBound = "checkpoint_bound",
  /** Closeout 因已知问题停止。 */
  Blocked = "blocked",
  /** Closeout 的持久化或外部结果无法确认。 */
  OutcomeUnknown = "outcome_unknown",
}

/** Closeout 被阻断时可记录的活动阶段。 */
export enum CodingTaskSessionCloseoutStage {
  /** 尚未持久化提交前 Snapshot。 */
  Closing = "closing",
  /** Snapshot 与 Action Evidence 已持久化。 */
  SnapshotPersisted = "snapshot_persisted",
  /** ChangeSet Checkpoint 已完成绑定。 */
  CheckpointBound = "checkpoint_bound",
}
