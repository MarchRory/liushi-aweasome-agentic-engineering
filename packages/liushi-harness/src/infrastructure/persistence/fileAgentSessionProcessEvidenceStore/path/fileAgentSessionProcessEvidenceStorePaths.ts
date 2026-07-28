import { resolve } from "node:path";

import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import {
  AGENT_SESSION_PROCESS_EVIDENCE_DIRECTORY_NAME,
  AGENT_SESSION_PROCESS_EVIDENCE_FILE_NAME,
  AGENT_SESSION_PROCESS_EVIDENCE_LOCK_FILE_NAME,
} from "../constants/index.js";
import type { AgentSessionProcessEvidenceStorePaths } from "../contracts/index.js";

/** 从可信 Store Root 与已校验标识符推导进程证据路径。 */
export function resolveAgentSessionProcessEvidenceStorePaths(
  storeRoot: string,
  workspaceId: WorkspaceId,
  sessionId: CodingTaskSessionId,
): AgentSessionProcessEvidenceStorePaths {
  const workspaceDirectory = resolve(storeRoot, "workspaces", workspaceId);
  const sessionDirectory = resolve(
    workspaceDirectory,
    AGENT_SESSION_PROCESS_EVIDENCE_DIRECTORY_NAME,
    sessionId,
  );
  return {
    workspaceId,
    sessionId,
    workspaceDirectory,
    sessionDirectory,
    recordFile: resolve(sessionDirectory, AGENT_SESSION_PROCESS_EVIDENCE_FILE_NAME),
    lockFile: resolve(sessionDirectory, AGENT_SESSION_PROCESS_EVIDENCE_LOCK_FILE_NAME),
  };
}
