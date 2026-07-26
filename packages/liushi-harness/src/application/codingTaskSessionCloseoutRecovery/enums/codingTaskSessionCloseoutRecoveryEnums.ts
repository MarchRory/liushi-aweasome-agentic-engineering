/** Closeout Recovery Assessment 可供 Human 选择的封闭 Resolution。 */
export enum CodingTaskSessionCloseoutRecoveryResolution {
  /** 只读复验已经存在且精确绑定的 Checkpoint。 */
  BindExisting = "bind_existing",
  /** 仅在明确未应用 Checkpoint 且 Snapshot 未漂移时重试一次。 */
  RetryOnce = "retry_once",
}

/** Closeout Recovery Assessment 的封闭处置结果。 */
export enum CodingTaskSessionCloseoutRecoveryDisposition {
  /** 当前证据允许唯一一种 Resolution。 */
  ResolutionAvailable = "resolution_available",
  /** 当前证据不足，必须交由 Human 处理。 */
  HumanRequired = "human_required",
}

/** Closeout Recovery Assessment 的稳定诊断分类。 */
export enum CodingTaskSessionCloseoutRecoveryDiagnostic {
  /** 当前证据允许 RetryOnce。 */
  RetryAvailable = "retry_available",
  /** 当前证据允许 BindExisting。 */
  BindExistingAvailable = "bind_existing_available",
  /** Closeout 停止阶段不允许当前恢复路径。 */
  CloseoutStageNotAllowed = "closeout_stage_not_allowed",
  /** Closeout 错误码不允许当前恢复路径。 */
  CloseoutErrorNotAllowed = "closeout_error_not_allowed",
  /** Checkpoint Recovery 无法证明状态。 */
  CheckpointUnknown = "checkpoint_unknown",
  /** 需要 Checkpoint 时明确不存在。 */
  CheckpointMissing = "checkpoint_missing",
  /** Retry 路径发现意外存在的 Checkpoint。 */
  CheckpointUnexpected = "checkpoint_unexpected",
  /** 保留的 Checkpoint 与新复验结果不匹配。 */
  CheckpointMismatch = "checkpoint_mismatch",
  /** Snapshot 端口无法证明当前 Snapshot。 */
  SnapshotUnknown = "snapshot_unknown",
  /** 当前 Snapshot 与持久化 Snapshot 漂移。 */
  SnapshotDrift = "snapshot_drift",
}
