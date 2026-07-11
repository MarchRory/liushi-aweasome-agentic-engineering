import {
  LockReleaseStatus,
  ParentDirectorySyncStatus,
  SnapshotPersistenceStatus,
  type TaskPersistenceOutcome,
  type TaskRepositoryAppendOutput,
} from "#application/index.js";
import { success, type HarnessError, type Result } from "#common/index.js";
import type { TaskAggregateRecord } from "#domain/taskRun/index.js";

import {
  determinePersistenceHealth,
  releaseLockBestEffort,
  syncParentDirectoryBestEffort,
} from "../commitRecovery/index.js";
import type { TaskStorePaths } from "../contracts/index.js";
import { EventLogHandleStatus, type EventLogCommitOutcome } from "../eventLog/index.js";
import type { ExclusiveFileLockHandle } from "../lock/index.js";
import { createTaskAggregateSnapshot } from "../snapshot/index.js";
import type { TaskPersistenceDependencies } from "../taskCreation/index.js";

/** Event 已提交后，以降级成功语义写 Snapshot 并释放 Task Lock。 */
export async function finalizeAppendedTaskEvent(
  paths: TaskStorePaths,
  record: TaskAggregateRecord,
  eventCommit: EventLogCommitOutcome,
  taskLock: ExclusiveFileLockHandle,
  dependencies: TaskPersistenceDependencies,
): Promise<Result<TaskRepositoryAppendOutput, HarnessError>> {
  const eventDirectory = await syncParentDirectoryBestEffort(
    dependencies.parentDirectoryDurability,
    paths.eventsFile,
  );
  let snapshot = SnapshotPersistenceStatus.Written;
  let snapshotDirectory = ParentDirectorySyncStatus.Synced;
  const recoveryPaths: string[] = [];
  if (eventCommit.handle === EventLogHandleStatus.RecoveryRequired) {
    recoveryPaths.push(paths.eventsFile);
  }

  try {
    await dependencies.snapshotStore.write(paths.snapshotFile, createTaskAggregateSnapshot(record));
    snapshotDirectory = await syncParentDirectoryBestEffort(
      dependencies.parentDirectoryDurability,
      paths.snapshotFile,
    );
  } catch {
    snapshot = SnapshotPersistenceStatus.RebuildRequired;
    snapshotDirectory = ParentDirectorySyncStatus.BestEffort;
    recoveryPaths.push(paths.snapshotFile);
  }

  const taskLockStatus = await releaseLockBestEffort(taskLock);
  if (taskLockStatus === LockReleaseStatus.RecoveryRequired) {
    recoveryPaths.push(paths.lockFile);
  }
  const workspaceLock = LockReleaseStatus.Released;
  const persistence: TaskPersistenceOutcome = {
    overall: determinePersistenceHealth({
      snapshot,
      taskLock: taskLockStatus,
      workspaceLock,
      eventDirectory,
      snapshotDirectory,
      recoveryPaths,
    }),
    snapshot,
    taskLock: taskLockStatus,
    workspaceLock,
    eventDirectory,
    snapshotDirectory,
    recoveryPaths,
  };
  return success({ record, persistence });
}
