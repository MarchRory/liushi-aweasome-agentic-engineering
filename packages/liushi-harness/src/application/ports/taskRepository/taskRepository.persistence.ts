/** Task create 持久化结果的整体健康状态。 */
export enum PersistenceHealth {
  /** Event、Snapshot、Lock cleanup 和目录耐久性步骤均达到强一致预期。 */
  Healthy = "healthy",
  /** Event 已提交，但后续可恢复或 best-effort 步骤没有完全成功。 */
  Degraded = "degraded",
}

/** Task Snapshot 写入结果。 */
export enum SnapshotPersistenceStatus {
  /** Snapshot 已写入并完成 Adapter 负责的持久化步骤。 */
  Written = "written",
  /** Event 已提交，但 Snapshot 需要后续通过 Event Replay 重建。 */
  RebuildRequired = "rebuild_required",
}

/** File lock 释放结果。 */
export enum LockReleaseStatus {
  /** Lock 已释放，调用方无需恢复。 */
  Released = "released",
  /** Event 已提交，但 Lock 文件仍需显式恢复。 */
  RecoveryRequired = "recovery_required",
}

/** 父目录耐久性刷新结果。 */
export enum ParentDirectorySyncStatus {
  /** 父目录已成功 fsync。 */
  Synced = "synced",
  /** 当前平台或文件系统不支持目录 fsync，已记录为 best-effort。 */
  BestEffort = "best_effort",
}

/** Event commit 之后的持久化附属步骤结果。 */
export interface TaskPersistenceOutcome {
  /** 汇总健康状态，作为 human warning 和机器消费的主判定。 */
  overall: PersistenceHealth;
  /** Snapshot 是否已写入，或是否需要由 Event Replay 重建。 */
  snapshot: SnapshotPersistenceStatus;
  /** Task lock 是否已释放。 */
  taskLock: LockReleaseStatus;
  /** Workspace task-creation lock 是否已释放。 */
  workspaceLock: LockReleaseStatus;
  /** Event 文件所在父目录的 fsync 结果。 */
  eventDirectory: ParentDirectorySyncStatus;
  /** Snapshot 文件所在父目录的 fsync 结果。 */
  snapshotDirectory: ParentDirectorySyncStatus;
  /** 需要人工或 repair 流程处理的精确路径。 */
  recoveryPaths: readonly string[];
}
