/** Effective Closeout Resolver 的解析状态。 */
export enum CodingTaskSessionEffectiveCloseoutStatus {
  /** 已解析出可安全使用的 Checkpoint。 */
  Resolved = "resolved",
  /** 当前证据不足以解析出可安全使用的 Checkpoint。 */
  Unresolved = "unresolved",
}

/** 已解析 Checkpoint 的权威来源。 */
export enum CodingTaskSessionEffectiveCloseoutSource {
  /** 直接来自原 Closeout State。 */
  Original = "original",
  /** 来自已经绑定的 Recovery State。 */
  Recovery = "recovery",
}

/** Effective Closeout 无法解析时的稳定原因。 */
export enum CodingTaskSessionEffectiveCloseoutUnresolvedReason {
  /** 原 Closeout 尚未进入可恢复的终态。 */
  CloseoutNotTerminal = "closeout_not_terminal",
  /** 没有找到 Recovery State。 */
  RecoveryMissing = "recovery_missing",
  /** Recovery State 仍处于活动状态。 */
  RecoveryNonTerminal = "recovery_non_terminal",
  /** Recovery State 没有可用的 Checkpoint。 */
  RecoveryCheckpointUnavailable = "recovery_checkpoint_unavailable",
  /** 原 Closeout 与 Recovery 的稳定身份不一致。 */
  IdentityMismatch = "identity_mismatch",
  /** Recovery 与原 Closeout 的版本或完整摘要不一致。 */
  CloseoutBindingMismatch = "closeout_binding_mismatch",
  /** Recovery 与原 Closeout Snapshot 摘要不一致。 */
  SnapshotBindingMismatch = "snapshot_binding_mismatch",
  /** Recovery Checkpoint 与其绑定摘要不一致。 */
  CheckpointBindingMismatch = "checkpoint_binding_mismatch",
}
