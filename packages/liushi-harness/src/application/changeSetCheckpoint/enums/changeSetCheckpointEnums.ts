/** ChangeSet-bound Checkpoint 的稳定失败分类。 */
export enum ChangeSetCheckpointErrorCode {
  /** 输入 Snapshot 或 Checkpoint 身份不一致。 */
  InputInvalid = "change_set_checkpoint_input_invalid",
  /** 提交前现场无法与持久化 Snapshot 精确匹配。 */
  PreSubmitDrift = "change_set_checkpoint_pre_submit_drift",
  /** 已存在 Checkpoint，但无法证明它绑定目标 ChangeSet。 */
  ExistingCheckpointMismatch = "change_set_checkpoint_existing_mismatch",
  /** Git 副作用后无法证明 Checkpoint 与 ChangeSet 的绑定。 */
  PostconditionUnknown = "change_set_checkpoint_postcondition_unknown",
}

/** ChangeSet-bound Checkpoint 只读恢复评估的封闭三态。 */
export enum ChangeSetCheckpointRecoveryStatus {
  /** 已证明当前不存在满足条件的 Checkpoint。 */
  Absent = "absent",
  /** 已完成 Checkpoint、ChangeSet 与 Snapshot 的完整复验。 */
  Present = "present",
  /** 无法证明 Checkpoint 存在或不存在，必须交由上层 Human Gate 处理。 */
  Unknown = "unknown",
}
