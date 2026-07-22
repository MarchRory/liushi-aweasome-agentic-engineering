import { resolve } from "node:path";

import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import { CODING_TASK_SESSION_ACTIVATION_LEASE_LOCK_FILE_NAME } from "../constants/index.js";
import type { CodingTaskSessionActivationLeasePath } from "../contracts/index.js";

/** 从已校验的 Workspace 与 Session ID 推导独立 Lease 锁路径。 */
export function resolveCodingTaskSessionActivationLeasePath(
  storeRoot: string,
  workspaceId: WorkspaceId,
  sessionId: CodingTaskSessionId,
): CodingTaskSessionActivationLeasePath {
  const workspaceDirectory = resolve(storeRoot, "workspaces", workspaceId);
  const sessionDirectory = resolve(workspaceDirectory, "codingTaskSessions", sessionId);
  return {
    workspaceDirectory,
    sessionDirectory,
    lockFile: resolve(sessionDirectory, CODING_TASK_SESSION_ACTIVATION_LEASE_LOCK_FILE_NAME),
    workspaceId,
    sessionId,
  };
}
