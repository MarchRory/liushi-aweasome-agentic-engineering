import { resolve } from "node:path";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";
import {
  CODING_TASK_DIRECTORY_NAME,
  CODING_TASK_EVENTS_FILE_NAME,
  CODING_TASK_LOCK_FILE_NAME,
} from "../constants/index.js";

/** CodingTask 文件存储的完整路径集合。 */
export interface CodingTaskStorePaths {
  /** 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** CodingTask 稳定标识。 */
  codingTaskId: CodingTaskId;
  /** CodingTask 目录。 */
  codingTaskDirectory: string;
  /** 追加写入的 Event JSONL 文件。 */
  eventsFile: string;
  /** CodingTask 级别锁文件。 */
  lockFile: string;
}

/** 解析 CodingTask 文件布局。 */
export function resolveCodingTaskStorePaths(
  root: string,
  workspaceId: WorkspaceId,
  codingTaskId: CodingTaskId,
): CodingTaskStorePaths {
  const workspace = resolve(root, "workspaces", workspaceId);
  const codingTaskDirectory = resolve(workspace, CODING_TASK_DIRECTORY_NAME, codingTaskId);
  return {
    workspaceId,
    codingTaskId,
    codingTaskDirectory,
    eventsFile: resolve(codingTaskDirectory, CODING_TASK_EVENTS_FILE_NAME),
    lockFile: resolve(codingTaskDirectory, CODING_TASK_LOCK_FILE_NAME),
  };
}
