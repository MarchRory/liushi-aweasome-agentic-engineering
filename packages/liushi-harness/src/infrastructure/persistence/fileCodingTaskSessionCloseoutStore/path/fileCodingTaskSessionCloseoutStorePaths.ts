import { resolve } from "node:path";

import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import {
  CODING_TASK_SESSION_CLOSEOUT_LOCK_FILE_NAME,
  CODING_TASK_SESSION_CLOSEOUT_SESSIONS_DIRECTORY_NAME,
  CODING_TASK_SESSION_CLOSEOUT_STATE_FILE_NAME,
} from "../constants/index.js";
import type { CodingTaskSessionCloseoutStorePaths } from "../contracts/index.js";

/** 从已验证标识推导 Closeout State 与共用锁的文件路径。 */
export function resolveCodingTaskSessionCloseoutStorePaths(
  storeRoot: string,
  workspaceId: WorkspaceId,
  sessionId: CodingTaskSessionId,
): CodingTaskSessionCloseoutStorePaths {
  const workspaceDirectory = resolve(storeRoot, "workspaces", workspaceId);
  const sessionDirectory = resolve(
    workspaceDirectory,
    CODING_TASK_SESSION_CLOSEOUT_SESSIONS_DIRECTORY_NAME,
    sessionId,
  );
  return {
    workspaceDirectory,
    sessionDirectory,
    stateFile: resolve(sessionDirectory, CODING_TASK_SESSION_CLOSEOUT_STATE_FILE_NAME),
    lockFile: resolve(sessionDirectory, CODING_TASK_SESSION_CLOSEOUT_LOCK_FILE_NAME),
    workspaceId,
    sessionId,
  };
}
