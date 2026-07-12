import { resolve } from "node:path";

import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import {
  TASK_EVENTS_FILE_NAME,
  TASK_ACTIONS_FILE_NAME,
  TASK_ACTIONS_LOCK_FILE_NAME,
  TASK_TRACES_FILE_NAME,
  TASK_TRACES_LOCK_FILE_NAME,
  TASK_LOCK_FILE_NAME,
  TASK_SNAPSHOT_FILE_NAME,
  TASKS_DIRECTORY_NAME,
  WORKSPACE_TASK_CREATION_LOCK_FILE_NAME,
  WORKSPACES_DIRECTORY_NAME,
} from "../constants/index.js";
import type { TaskStorePaths } from "../contracts/index.js";

/** 从已校验 ID 确定性解析 Task Store 路径。 */
export function resolveTaskStorePaths(
  storeRoot: string,
  workspaceId: WorkspaceId,
  taskId: TaskId,
): TaskStorePaths {
  const normalizedRoot = resolve(storeRoot);
  const workspaceDirectory = resolve(normalizedRoot, WORKSPACES_DIRECTORY_NAME, workspaceId);
  const tasksDirectory = resolve(workspaceDirectory, TASKS_DIRECTORY_NAME);
  const taskDirectory = resolve(tasksDirectory, taskId);

  return {
    workspaceId,
    taskId,
    storeRoot: normalizedRoot,
    workspaceDirectory,
    tasksDirectory,
    taskDirectory,
    eventsFile: resolve(taskDirectory, TASK_EVENTS_FILE_NAME),
    snapshotFile: resolve(taskDirectory, TASK_SNAPSHOT_FILE_NAME),
    actionsFile: resolve(taskDirectory, TASK_ACTIONS_FILE_NAME),
    tracesFile: resolve(taskDirectory, TASK_TRACES_FILE_NAME),
    lockFile: resolve(taskDirectory, TASK_LOCK_FILE_NAME),
    actionsLockFile: resolve(taskDirectory, TASK_ACTIONS_LOCK_FILE_NAME),
    tracesLockFile: resolve(taskDirectory, TASK_TRACES_LOCK_FILE_NAME),
    workspaceTaskCreationLockFile: resolve(
      workspaceDirectory,
      WORKSPACE_TASK_CREATION_LOCK_FILE_NAME,
    ),
  };
}
