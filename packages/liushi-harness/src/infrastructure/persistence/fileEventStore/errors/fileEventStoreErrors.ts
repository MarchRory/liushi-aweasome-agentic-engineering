import type { TaskLocator } from "#application/index.js";
import { HarnessError, HarnessErrorCode } from "#common/index.js";

import type { TaskStorePaths } from "../contracts/index.js";

/** 创建稳定的 Task Not Found 错误。 */
export function createTaskNotFoundError(locator: TaskLocator): HarnessError {
  return new HarnessError(HarnessErrorCode.TaskNotFound, "Task runtime state was not found.", {
    workspaceId: locator.workspaceId,
    taskId: locator.taskId,
  });
}

/** 将 Adapter 内未知失败转换为稳定 Harness Error。 */
export function toFileEventStoreError(
  error: unknown,
  message: string,
  paths: TaskStorePaths,
): HarnessError {
  if (error instanceof HarnessError) {
    return error;
  }
  return new HarnessError(
    HarnessErrorCode.IoFailure,
    message,
    { taskDirectory: paths.taskDirectory },
    error,
  );
}
