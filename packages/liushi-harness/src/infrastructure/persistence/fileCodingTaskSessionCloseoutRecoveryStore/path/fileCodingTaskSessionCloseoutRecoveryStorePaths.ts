import { resolve } from "node:path";

import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import {
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_LOCK_FILE_NAME,
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_SESSIONS_DIRECTORY_NAME,
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_FILE_NAME,
} from "../constants/index.js";
import type { CodingTaskSessionCloseoutRecoveryStorePaths } from "../contracts/index.js";

/** 从已验证标识推导 Recovery State 与独立锁的精确路径。 */
export function resolveCodingTaskSessionCloseoutRecoveryStorePaths(
  storeRoot: string,
  workspaceId: WorkspaceId,
  sessionId: CodingTaskSessionId,
): CodingTaskSessionCloseoutRecoveryStorePaths {
  const workspaceDirectory = resolve(storeRoot, "workspaces", workspaceId);
  const sessionDirectory = resolve(
    workspaceDirectory,
    CODING_TASK_SESSION_CLOSEOUT_RECOVERY_SESSIONS_DIRECTORY_NAME,
    sessionId,
  );
  return {
    workspaceDirectory,
    sessionDirectory,
    stateFile: resolve(sessionDirectory, CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_FILE_NAME),
    lockFile: resolve(sessionDirectory, CODING_TASK_SESSION_CLOSEOUT_RECOVERY_LOCK_FILE_NAME),
    workspaceId,
    sessionId,
  };
}
