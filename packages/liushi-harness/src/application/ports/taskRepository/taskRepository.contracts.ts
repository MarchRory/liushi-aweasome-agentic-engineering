import type { ActorRef } from "#common/index.js";
import type { TaskId, TaskState } from "#domain/task/index.js";
import type { TaskRunEventType } from "#domain/taskRun/index.js";
import {
  type ApprovalRecordedPayload,
  type ArtifactCommittedPayload,
  type TaskAggregateRecord,
} from "#domain/taskRun/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { TaskPersistenceOutcome } from "./taskRepository.persistence.js";

/** create 成功时返回的 Task 与持久化健康信息。 */
export interface TaskRepositoryCreateOutput {
  /** 由 authoritative Event Replay 得到的 Task 状态。 */
  task: TaskState;
  /** Event commit boundary 之后的持久化附属步骤结果。 */
  persistence: TaskPersistenceOutcome;
}

/** 定位一个 Workspace 内 Task 的稳定键。 */
export interface TaskLocator {
  /** Task 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** Task 的稳定 ULID。 */
  taskId: TaskId;
}

/** Task Event Append 的公共乐观并发与 Actor 输入。 */
export interface TaskEventAppendBase {
  /** 目标 Task。 */
  locator: TaskLocator;
  /** 调用方读取到的 Event Tail Sequence。 */
  expectedLastSequence: number;
  /** 调用方读取到的 Event Tail Hash。 */
  expectedLastEventHash: string;
  /** Event 发生时间。 */
  occurredAt: string;
  /** 触发 Event 的 Actor。 */
  actor: ActorRef;
}

/** Append ArtifactCommitted Event 的输入。 */
export interface AppendArtifactCommittedInput extends TaskEventAppendBase {
  /** Event discriminator。 */
  type: TaskRunEventType.ArtifactCommitted;
  /** Artifact、Gate Evaluation 与可选 DecisionRequest。 */
  payload: ArtifactCommittedPayload;
}

/** Append ApprovalRecorded Event 的输入。 */
export interface AppendApprovalRecordedInput extends TaskEventAppendBase {
  /** Event discriminator。 */
  type: TaskRunEventType.ApprovalRecorded;
  /** Approval 与 Gate Evaluation。 */
  payload: ApprovalRecordedPayload;
}

/** TaskRepository 允许 Append 的内部语义事件 union。 */
export type TaskEventAppendInput = AppendArtifactCommittedInput | AppendApprovalRecordedInput;

/** Event Append 成功后的权威聚合与持久化健康信息。 */
export interface TaskRepositoryAppendOutput {
  /** Append 后由完整 Event Replay 得到的 Task Aggregate。 */
  record: TaskAggregateRecord;
  /** Event commit boundary 之后的持久化附属步骤结果。 */
  persistence: TaskPersistenceOutcome;
}
