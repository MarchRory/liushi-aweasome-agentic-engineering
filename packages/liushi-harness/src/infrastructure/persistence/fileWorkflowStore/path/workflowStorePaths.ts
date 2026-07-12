import { resolve } from "node:path";

import type { WorkflowId } from "#domain/workflow/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import {
  WORKFLOW_DIRECTORY_NAME,
  WORKFLOW_EVENTS_FILE_NAME,
  WORKFLOW_LOCK_FILE_NAME,
} from "../constants/index.js";

/** 一个 Workflow File Store 使用的完整路径集合。 */
export interface WorkflowStorePaths {
  /** Workflow 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Workflow 稳定 ID。 */
  readonly workflowId: WorkflowId;
  /** Workflow 运行时目录。 */
  readonly workflowDirectory: string;
  /** Append-only Event JSONL 文件。 */
  readonly eventsFile: string;
  /** Workflow 级别跨进程 Lock 文件。 */
  readonly lockFile: string;
}

/** 从已校验 ID 确定性解析 Workflow File Store 路径。 */
export function resolveWorkflowStorePaths(
  root: string,
  workspaceId: WorkspaceId,
  workflowId: WorkflowId,
): WorkflowStorePaths {
  const workspace = resolve(root, "workspaces", workspaceId);
  const workflowDirectory = resolve(workspace, WORKFLOW_DIRECTORY_NAME, workflowId);
  return {
    workspaceId,
    workflowId,
    workflowDirectory,
    eventsFile: resolve(workflowDirectory, WORKFLOW_EVENTS_FILE_NAME),
    lockFile: resolve(workflowDirectory, WORKFLOW_LOCK_FILE_NAME),
  };
}
