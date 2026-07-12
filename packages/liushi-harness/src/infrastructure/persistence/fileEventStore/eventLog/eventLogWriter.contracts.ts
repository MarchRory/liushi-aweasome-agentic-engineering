/** Event Log 已提交后的文件句柄释放状态。 */
export enum EventLogHandleStatus {
  /** Event 文件已 fsync，文件句柄也已正常关闭。 */
  Released = "released",
  /** Event 文件已 fsync，但关闭句柄失败，需要显式诊断。 */
  RecoveryRequired = "recovery_required",
}

/** Event Log 提交阶段中无法确定持久化结果的失败位置。 */
export enum EventLogCommitFailureStage {
  /** 写入操作已开始但未能正常完成。 */
  Write = "write",
  /** 写入已完成但 fsync 未能正常完成。 */
  Sync = "sync",
}

/** Event Log 提交边界所需的最小文件句柄协议。 */
export interface EventLogCommitHandle {
  /** 刷新已写入的文件内容。 */
  sync(): Promise<void>;
  /** 关闭文件句柄。 */
  close(): Promise<void>;
}

/** Event Log 跨过权威提交边界后的结果。 */
export interface EventLogCommitOutcome {
  /** 已提交 Event 对应的文件句柄释放状态。 */
  handle: EventLogHandleStatus;
}
