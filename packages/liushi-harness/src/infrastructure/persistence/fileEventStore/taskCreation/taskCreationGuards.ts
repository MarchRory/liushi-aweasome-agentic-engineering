import { HarnessError, HarnessErrorCode } from "#common/index.js";

import type { TaskStorePaths } from "../contracts/index.js";
import {
  ACTION_EXECUTION_LOCKS_DIRECTORY_NAME,
  TASK_EVENTS_FILE_NAME,
  TASK_ACTIONS_FILE_NAME,
  TASK_ACTIONS_LOCK_FILE_NAME,
  TASK_TRACES_FILE_NAME,
  TASK_TRACES_LOCK_FILE_NAME,
  TASK_LOCK_FILE_NAME,
  TASK_SNAPSHOT_FILE_NAME,
} from "../constants/index.js";
import { listTaskStoreEntries, listWorkspaceTaskEntries, pathExists } from "../taskStore/index.js";

/** 返回阻止当前 Workspace 创建 Task 的精确冲突；无冲突时返回 undefined。 */
export async function findWorkspaceTaskConflict(
  paths: TaskStorePaths,
): Promise<HarnessError | undefined> {
  const workspaceEntries = await listWorkspaceTaskEntries(paths.tasksDirectory);
  if (workspaceEntries.length === 0) {
    return undefined;
  }
  if (!workspaceEntries.includes(paths.taskId)) {
    return new HarnessError(
      HarnessErrorCode.WorkspaceBusy,
      "Workspace already contains an active task.",
      { workspaceId: paths.workspaceId, tasksDirectory: paths.tasksDirectory },
    );
  }

  return classifyExistingTaskStore(paths);
}

/** 确认当前 Task 目录仅包含本次事务持有的 Lock。 */
export async function assertNewTaskStore(paths: TaskStorePaths): Promise<void> {
  if ((await pathExists(paths.eventsFile)) || (await pathExists(paths.snapshotFile))) {
    throw taskAlreadyExists(paths);
  }

  const unexpectedEntries = (await listTaskStoreEntries(paths.taskDirectory))
    .filter((entry) => entry !== TASK_LOCK_FILE_NAME)
    .sort();
  if (unexpectedEntries.length > 0) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Task directory contains unrecognized runtime state.",
      { taskDirectory: paths.taskDirectory, entries: unexpectedEntries.join(",") },
    );
  }
}

async function classifyExistingTaskStore(paths: TaskStorePaths): Promise<HarnessError> {
  const entries = (await listTaskStoreEntries(paths.taskDirectory)).sort();
  if (
    entries.includes(TASK_LOCK_FILE_NAME) ||
    entries.includes(TASK_ACTIONS_LOCK_FILE_NAME) ||
    entries.includes(TASK_TRACES_LOCK_FILE_NAME)
  ) {
    return new HarnessError(
      HarnessErrorCode.LockUnavailable,
      "Task runtime lock is already held or requires explicit recovery.",
      {
        lockFile: entries.includes(TASK_LOCK_FILE_NAME)
          ? paths.lockFile
          : entries.includes(TASK_ACTIONS_LOCK_FILE_NAME)
            ? paths.actionsLockFile
            : paths.tracesLockFile,
      },
    );
  }

  const unknownEntries = entries.filter(
    (entry) =>
      entry !== TASK_EVENTS_FILE_NAME &&
      entry !== TASK_SNAPSHOT_FILE_NAME &&
      entry !== TASK_ACTIONS_FILE_NAME &&
      entry !== TASK_TRACES_FILE_NAME &&
      entry !== ACTION_EXECUTION_LOCKS_DIRECTORY_NAME,
  );
  if (unknownEntries.length > 0 || entries.length === 0) {
    return new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Existing Task directory does not contain a recognized committed state.",
      { taskDirectory: paths.taskDirectory, entries: entries.join(",") },
    );
  }

  return taskAlreadyExists(paths);
}

function taskAlreadyExists(paths: TaskStorePaths): HarnessError {
  return new HarnessError(
    HarnessErrorCode.TaskAlreadyExists,
    "Task already has persisted runtime state.",
    { workspaceId: paths.workspaceId, taskId: paths.taskId },
  );
}
