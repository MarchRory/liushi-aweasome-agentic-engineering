import type { ActorRef } from "../../common/types/actor.js";
import type { WorkspaceId } from "../workspace/workspace-id.js";
import type { EventId, TaskId } from "./task-id.js";
import type { TaskState } from "./task-state.js";

/** Task Event Store 首条纵向切片支持的事件类别。 */
export enum TaskEventType {
  /** Task 已创建并进入 Context/Running。 */
  TaskCreated = "task_created",
}

/** TaskCreated Event 保存的完整初始状态。 */
export interface TaskCreatedPayload {
  /** 由该事件创建的 Task State。 */
  task: TaskState;
}

/** Append-only Store 中的一条 TaskCreated Event。 */
export interface TaskEventRecord {
  /** Task Event Schema Version。 */
  schemaVersion: string;
  /** Event 的稳定 ULID。 */
  eventId: EventId;
  /** Event 所属 Task。 */
  taskId: TaskId;
  /** Event 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** Task 内从 1 开始严格递增的序号。 */
  sequence: number;
  /** 当前 Event 类别。 */
  type: TaskEventType.TaskCreated;
  /** Event 发生时间。 */
  occurredAt: string;
  /** 触发 Event 的 Actor。 */
  actor: ActorRef;
  /** TaskCreated Event Payload。 */
  payload: TaskCreatedPayload;
  /** 前一条 Event Hash 或固定 Genesis Hash。 */
  previousHash: string;
  /** 当前 Event 内容计算出的 SHA-256 Hash。 */
  hash: string;
}

/** Snapshot 保存的 Task State 和对应 Event Tail。 */
export interface TaskSnapshot {
  /** Task Snapshot Schema Version。 */
  schemaVersion: string;
  /** Snapshot 对应的 Task State。 */
  task: TaskState;
  /** Snapshot 已应用的最后 Event Sequence。 */
  lastSequence: number;
  /** Snapshot 已应用的最后 Event Hash。 */
  lastEventHash: string;
}
