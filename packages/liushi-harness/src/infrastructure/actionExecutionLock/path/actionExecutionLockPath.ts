import { join } from "node:path";

import type { ActionExecutionLockRequest } from "#application/ports/index.js";

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
    "actionExecutionLocks",
    `${input.actionId}.lock`,
  );
}
