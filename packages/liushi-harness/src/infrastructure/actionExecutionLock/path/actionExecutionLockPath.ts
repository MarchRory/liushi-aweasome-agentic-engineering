import { join } from "node:path";

import type { ActionExecutionLockRequest } from "#application/ports/index.js";
import { ACTION_EXECUTION_LOCKS_DIRECTORY_NAME } from "#infrastructure/persistence/fileEventStore/constants/index.js";

/** 生成仅在 Infrastructure 内使用的 Action 执行锁路径。 */
export function resolveActionExecutionLockPath(
  storeRoot: string,
  input: ActionExecutionLockRequest,
): string {
  return join(
    storeRoot,
    "workspaces",
    input.workspaceId,
    "tasks",
    input.taskId,
    ACTION_EXECUTION_LOCKS_DIRECTORY_NAME,
    `${input.actionId}.lock`,
  );
}
