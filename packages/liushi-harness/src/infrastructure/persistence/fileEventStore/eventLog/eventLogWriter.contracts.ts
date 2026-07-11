/** Event Log 已提交后的文件句柄释放状态。 */
export enum EventLogHandleStatus {
  /** Event 文件已 fsync，文件句柄也已正常关闭。 */
  Released = "released",
  /** Event 文件已 fsync，但关闭句柄失败，需要显式诊断。 */
  RecoveryRequired = "recovery_required",
}

/** Event Log 跨过权威提交边界后的结果。 */
export interface EventLogCommitOutcome {
  /** 已提交 Event 对应的文件句柄释放状态。 */
  handle: EventLogHandleStatus;
}
