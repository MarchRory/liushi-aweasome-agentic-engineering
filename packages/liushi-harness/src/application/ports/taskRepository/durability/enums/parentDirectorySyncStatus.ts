/** 父目录耐久性刷新结果。 */
export enum ParentDirectorySyncStatus {
  /** 父目录已成功 fsync。 */
  Synced = "synced",
  /** 平台适配器确认目录 fsync 不可用，但提交协议已达到该平台的等价耐久语义。 */
  PlatformEquivalent = "platform_equivalent",
  /** 当前平台或文件系统不支持目录 fsync，已记录为 best-effort。 */
  BestEffort = "best_effort",
}
