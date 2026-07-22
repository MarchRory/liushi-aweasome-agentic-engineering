import { resolve } from "node:path";

import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import {
  CODING_TASK_SESSION_ACTIVATION_FILE_NAME,
  CODING_TASK_SESSION_ACTIVATION_LOCK_FILE_NAME,
  CODING_TASK_SESSION_ACTIVATIONS_DIRECTORY_NAME,
} from "../constants/index.js";
import type { CodingTaskSessionActivationStorePaths } from "../contracts/index.js";

/** 从可信 storeRoot 与已校验标识符推导 Activation 存储路径。 */
export function resolveCodingTaskSessionActivationStorePaths(
  storeRoot: string,
  workspaceId: WorkspaceId,
  sessionId: CodingTaskSessionId,
): CodingTaskSessionActivationStorePaths {
  const workspaceDirectory = resolve(storeRoot, "workspaces", workspaceId);
  const sessionDirectory = resolve(
    workspaceDirectory,
    CODING_TASK_SESSION_ACTIVATIONS_DIRECTORY_NAME,
    sessionId,
  );
  return {
    workspaceId,
    sessionId,
    workspaceDirectory,
    sessionDirectory,
    recordFile: resolve(sessionDirectory, CODING_TASK_SESSION_ACTIVATION_FILE_NAME),
    lockFile: resolve(sessionDirectory, CODING_TASK_SESSION_ACTIVATION_LOCK_FILE_NAME),
  };
}
