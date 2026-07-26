import { resolve } from "node:path";

import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import {
  CODING_TASK_SESSION_ADMISSION_FILE_NAME,
  CODING_TASK_SESSION_ADMISSION_LOCK_FILE_NAME,
} from "../constants/index.js";
import type { CodingTaskSessionAdmissionStorePaths } from "../contracts/index.js";

/** 从可信 storeRoot 与已校验标识推导 Admission 文件路径。 */
export function resolveCodingTaskSessionAdmissionStorePaths(
  storeRoot: string,
  workspaceId: WorkspaceId,
  sessionId: CodingTaskSessionId,
): CodingTaskSessionAdmissionStorePaths {
  const workspaceDirectory = resolve(storeRoot, "workspaces", workspaceId);
  const sessionDirectory = resolve(workspaceDirectory, "codingTaskSessions", sessionId);
  return {
    workspaceId,
    sessionId,
    workspaceDirectory,
    sessionDirectory,
    stateFile: resolve(sessionDirectory, CODING_TASK_SESSION_ADMISSION_FILE_NAME),
    lockFile: resolve(sessionDirectory, CODING_TASK_SESSION_ADMISSION_LOCK_FILE_NAME),
  };
}
