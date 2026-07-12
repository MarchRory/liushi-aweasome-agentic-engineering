import type { TaskId, TaskState } from "#domain/task/index.js";
import type { TaskAggregate } from "#domain/taskRun/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** 一个 Task File Store 使用的全部规范路径。 */
export interface TaskStorePaths {
  /** 当前 Workspace 的已校验 ID。 */
  workspaceId: WorkspaceId;
  /** 当前 Task 的已校验 ID。 */
  taskId: TaskId;
  /** 规范化后的 Harness Runtime 根目录。 */
  storeRoot: string;
  /** 当前 Workspace Runtime 目录。 */
  workspaceDirectory: string;
  /** 当前 Workspace 下所有 Task Runtime 目录的父目录。 */
  tasksDirectory: string;
  /** 当前 Task Runtime 目录。 */
  taskDirectory: string;
  /** Append-only Event JSONL 文件。 */
  eventsFile: string;
  /** 原子更新的 Snapshot JSON 文件。 */
  snapshotFile: string;
  /** Append-only Action Journal JSONL 文件。 */
  actionsFile: string;
  /** 可丢失 Trace Observation JSONL 文件。 */
  tracesFile: string;
  /** Task 级跨进程排他 Lock 文件。 */
  lockFile: string;
  /** Action Journal 跨进程排他 Lock 文件。 */
  actionsLockFile: string;
  /** Trace Observation 跨进程排他 Lock 文件。 */
  tracesLockFile: string;
  /** Workspace 内 Task 创建排他 Lock 文件。 */
  workspaceTaskCreationLockFile: string;
}

/** Event Replay 后用于校验 Snapshot 的完整尾部信息。 */
export interface TaskReplayResult {
  /** 从事件重建的 Task State。 */
  task: TaskState;
  /** 从全部事件重建的 Task Aggregate。 */
  aggregate: TaskAggregate;
  /** 已应用的最后 Event Sequence。 */
  lastSequence: number;
  /** 已应用的最后 Event Hash。 */
  lastEventHash: string;
}
