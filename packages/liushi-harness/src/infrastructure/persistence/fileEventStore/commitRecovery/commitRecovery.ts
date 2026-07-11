import {
  LockReleaseStatus,
  ParentDirectorySyncStatus,
  PersistenceHealth,
  SnapshotPersistenceStatus,
} from "#application/index.js";
import { HarnessError, failure, type Result } from "#common/index.js";

import type { TaskStorePaths } from "../contracts/index.js";
import { toFileEventStoreError } from "../errors/index.js";
import type { ExclusiveFileLockHandle } from "../lock/index.js";
import type { ParentDirectoryDurability } from "../parentDirectoryDurability/index.js";
import type { PreCommitLocks } from "./commitRecovery.contracts.js";

/** 释放 Lock，并把异常转换为可恢复状态。 */
export async function releaseLockBestEffort(
  lock: ExclusiveFileLockHandle,
): Promise<LockReleaseStatus> {
  try {
    await lock.release();
    return LockReleaseStatus.Released;
  } catch {
    return LockReleaseStatus.RecoveryRequired;
  }
}

/** 刷新文件父目录，并把平台不支持或异常转换为 best-effort。 */
export async function syncParentDirectoryBestEffort(
  durability: ParentDirectoryDurability,
  filePath: string,
): Promise<ParentDirectorySyncStatus> {
  try {
    return (await durability.syncParentDirectory(filePath)).status;
  } catch {
    return ParentDirectorySyncStatus.BestEffort;
  }
}

/** 在 Event 提交前失败时释放已获得的 Lock，并保留恢复路径。 */
export async function failBeforeEventCommit<T>(
  error: unknown,
  message: string,
  paths: TaskStorePaths,
  locks: PreCommitLocks,
): Promise<Result<T, HarnessError>> {
  const recoveryPaths: string[] = [];
  if (
    locks.task !== undefined &&
    (await releaseLockBestEffort(locks.task)) === LockReleaseStatus.RecoveryRequired
  ) {
    recoveryPaths.push(paths.lockFile);
  }
  if (
    locks.workspace !== undefined &&
    (await releaseLockBestEffort(locks.workspace)) === LockReleaseStatus.RecoveryRequired
  ) {
    recoveryPaths.push(paths.workspaceTaskCreationLockFile);
  }

  const baseError = toFileEventStoreError(error, message, paths);
  if (recoveryPaths.length === 0) {
    return failure(baseError);
  }
  return failure(
    new HarnessError(
      baseError.code,
      baseError.message,
      { ...baseError.details, recoveryPaths: recoveryPaths.join(",") },
      baseError,
    ),
  );
}

/** 根据全部 post-commit 结果计算统一持久化健康状态。 */
export function determinePersistenceHealth(input: {
  snapshot: SnapshotPersistenceStatus;
  taskLock: LockReleaseStatus;
  workspaceLock: LockReleaseStatus;
  eventDirectory: ParentDirectorySyncStatus;
  snapshotDirectory: ParentDirectorySyncStatus;
  recoveryPaths: readonly string[];
}): PersistenceHealth {
  return input.snapshot === SnapshotPersistenceStatus.Written &&
    input.taskLock === LockReleaseStatus.Released &&
    input.workspaceLock === LockReleaseStatus.Released &&
    input.eventDirectory === ParentDirectorySyncStatus.Synced &&
    input.snapshotDirectory === ParentDirectorySyncStatus.Synced &&
    input.recoveryPaths.length === 0
    ? PersistenceHealth.Healthy
    : PersistenceHealth.Degraded;
}
