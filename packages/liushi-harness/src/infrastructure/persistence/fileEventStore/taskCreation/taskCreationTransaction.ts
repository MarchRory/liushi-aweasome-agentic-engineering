import {
  LockReleaseStatus,
  ParentDirectorySyncStatus,
  SnapshotPersistenceStatus,
  type TaskPersistenceOutcome,
  type TaskRepositoryCreateOutput,
} from "#application/index.js";
import { ResultStatus, failure, success, type HarnessError, type Result } from "#common/index.js";
import type { TaskState } from "#domain/task/index.js";

import type { TaskStorePaths } from "../contracts/index.js";
import {
  determinePersistenceHealth,
  failBeforeEventCommit,
  releaseLockBestEffort,
  syncParentDirectoryBestEffort,
} from "../commitRecovery/index.js";
import { toFileEventStoreError } from "../errors/index.js";
import {
  EventLogHandleStatus,
  writeNewEventLog,
  type EventLogCommitOutcome,
} from "../eventLog/index.js";
import type { ExclusiveFileLockHandle } from "../lock/index.js";
import type {
  PreparedTaskCreation,
  TaskPersistenceDependencies,
} from "./taskCreation.contracts.js";
import { assertNewTaskStore, findWorkspaceTaskConflict } from "./taskCreationGuards.js";
import { prepareTaskCreation } from "./taskCreationPreparation.js";

/** 在 Workspace/Task Lock 下提交 Task Event，并以可恢复方式更新 Snapshot。 */
export async function createTaskInFileStore(
  paths: TaskStorePaths,
  task: TaskState,
  dependencies: TaskPersistenceDependencies,
): Promise<Result<TaskRepositoryCreateOutput, HarnessError>> {
  let workspaceLock: ExclusiveFileLockHandle;
  try {
    workspaceLock = await dependencies.lockManager.acquire(paths.workspaceTaskCreationLockFile, {
      workspaceId: paths.workspaceId,
    });
  } catch (error) {
    return failure(
      toFileEventStoreError(error, "Unable to acquire workspace task-creation lock.", paths),
    );
  }

  try {
    const conflict = await findWorkspaceTaskConflict(paths);
    if (conflict !== undefined) {
      return failBeforeEventCommit(conflict, "Unable to verify Workspace task capacity.", paths, {
        workspace: workspaceLock,
      });
    }
  } catch (error) {
    return failBeforeEventCommit(error, "Unable to inspect Workspace task capacity.", paths, {
      workspace: workspaceLock,
    });
  }

  const preparedResult = prepareTaskCreation(task, paths, dependencies.eventIdGenerator);
  if (preparedResult.status === ResultStatus.Failure) {
    return failBeforeEventCommit(preparedResult.error, "Unable to prepare Task creation.", paths, {
      workspace: workspaceLock,
    });
  }

  let taskLock: ExclusiveFileLockHandle;
  try {
    taskLock = await dependencies.lockManager.acquire(paths.lockFile, {
      workspaceId: paths.workspaceId,
      taskId: paths.taskId,
    });
  } catch (error) {
    return failBeforeEventCommit(error, "Unable to acquire task lock.", paths, {
      workspace: workspaceLock,
    });
  }

  let eventCommit: EventLogCommitOutcome;
  try {
    await assertNewTaskStore(paths);
    eventCommit = await writeNewEventLog(paths.eventsFile, preparedResult.value.event);
  } catch (error) {
    return failBeforeEventCommit(
      error,
      "Task store operation failed before authoritative event commit.",
      paths,
      { task: taskLock, workspace: workspaceLock },
    );
  }

  return finalizeCommittedTask(
    paths,
    preparedResult.value,
    eventCommit,
    taskLock,
    workspaceLock,
    dependencies,
  );
}

async function finalizeCommittedTask(
  paths: TaskStorePaths,
  prepared: PreparedTaskCreation,
  eventCommit: EventLogCommitOutcome,
  taskLock: ExclusiveFileLockHandle,
  workspaceLock: ExclusiveFileLockHandle,
  dependencies: TaskPersistenceDependencies,
): Promise<Result<TaskRepositoryCreateOutput, HarnessError>> {
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
    await dependencies.snapshotStore.write(paths.snapshotFile, prepared.snapshot);
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
  const workspaceLockStatus = await releaseLockBestEffort(workspaceLock);
  if (workspaceLockStatus === LockReleaseStatus.RecoveryRequired) {
    recoveryPaths.push(paths.workspaceTaskCreationLockFile);
  }

  const persistence: TaskPersistenceOutcome = {
    overall: determinePersistenceHealth({
      snapshot,
      taskLock: taskLockStatus,
      workspaceLock: workspaceLockStatus,
      eventDirectory,
      snapshotDirectory,
      recoveryPaths,
    }),
    snapshot,
    taskLock: taskLockStatus,
    workspaceLock: workspaceLockStatus,
    eventDirectory,
    snapshotDirectory,
    recoveryPaths,
  };
  return success({ task: prepared.replay.task, persistence });
}
