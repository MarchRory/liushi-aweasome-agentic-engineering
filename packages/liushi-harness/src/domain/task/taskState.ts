import { TASK_STATE_SCHEMA_VERSION, type ActorRef } from "#common/index.js";
import type { WorkspaceId } from "../workspace/index.js";
import type { TaskId } from "./taskId.js";
import { TaskPhase, TaskRunState } from "./taskPhase.js";

/** 一个可以由 Event Replay 重建的 Task 当前状态。 */
export interface TaskState {
  /** Task State schema 版本。 */
  schemaVersion: typeof TASK_STATE_SCHEMA_VERSION;
  /** Task 的稳定 ULID。 */
  taskId: TaskId;
  /** Task 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 外部 Ticket 或 Human 输入的可选来源。 */
  source?: string;
  /** Task 当前业务阶段。 */
  phase: TaskPhase;
  /** Task 当前运行状态。 */
  runState: TaskRunState;
  /** 创建 Task 的 Actor。 */
  createdBy: ActorRef;
  /** Task 创建时间的 ISO 8601 UTC 字符串。 */
  createdAt: string;
  /** 最后一次状态变化时间的 ISO 8601 UTC 字符串。 */
  updatedAt: string;
}

/** 创建 Task 初始 Context/Running 状态。 */
export function createInitialTaskState(input: {
  taskId: TaskId;
  workspaceId: WorkspaceId;
  source?: string;
  actor: ActorRef;
  occurredAt: string;
}): TaskState {
  return {
    schemaVersion: TASK_STATE_SCHEMA_VERSION,
    taskId: input.taskId,
    workspaceId: input.workspaceId,
    ...(input.source === undefined ? {} : { source: input.source }),
    phase: TaskPhase.Context,
    runState: TaskRunState.Running,
    createdBy: input.actor,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
}
