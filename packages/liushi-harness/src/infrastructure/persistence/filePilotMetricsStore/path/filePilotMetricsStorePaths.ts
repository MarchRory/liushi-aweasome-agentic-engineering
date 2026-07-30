import { resolve } from "node:path";

import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import {
  PILOT_METRICS_DIRECTORY_NAME,
  PILOT_METRICS_ENROLLMENT_FILE_NAME,
  PILOT_METRICS_LOCK_FILE_NAME,
  PILOT_METRICS_SESSIONS_DIRECTORY_NAME,
  PILOT_METRICS_SETTLEMENT_FILE_NAME,
} from "../constants/index.js";
import type { FilePilotMetricsStorePaths } from "../contracts/index.js";

/** 仅使用已解析 ID 构造 Pilot Metrics 的固定文件布局。 */
export function resolveFilePilotMetricsStorePaths(
  storeRoot: string,
  workspaceId: WorkspaceId,
  sessionId: CodingTaskSessionId,
): FilePilotMetricsStorePaths {
  const workspaceDirectory = resolve(storeRoot, "workspaces", workspaceId);
  const sessionDirectory = resolve(
    workspaceDirectory,
    PILOT_METRICS_DIRECTORY_NAME,
    PILOT_METRICS_SESSIONS_DIRECTORY_NAME,
    sessionId,
  );
  return {
    storeRoot,
    workspaceId,
    sessionId,
    workspaceDirectory,
    sessionDirectory,
    enrollmentFile: resolve(sessionDirectory, PILOT_METRICS_ENROLLMENT_FILE_NAME),
    settlementFile: resolve(sessionDirectory, PILOT_METRICS_SETTLEMENT_FILE_NAME),
    lockFile: resolve(sessionDirectory, PILOT_METRICS_LOCK_FILE_NAME),
  };
}
