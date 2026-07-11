import type { TASK_AGGREGATE_SNAPSHOT_SCHEMA_VERSION } from "#common/index.js";
import type { ApprovalRecord, DecisionRequest } from "#domain/approval/index.js";
import type { SupportedArtifact } from "#domain/artifact/index.js";
import type { GateEvaluation } from "#domain/gate/index.js";
import type {
  EventId,
  TaskEventRecord,
  TaskId,
  TaskState,
  TaskSnapshot,
} from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { TaskCheckpoint, TaskRunEventType } from "../enums/index.js";

/** 可由完整 Task Event Replay 重建的运行聚合。 */
export interface TaskAggregate {
  /** Task 的正交阶段和运行状态。 */
  task: TaskState;
  /** 当前最后完成的确定性检查点。 */
  checkpoint: TaskCheckpoint;
  /** 当前唯一阻断性 Human DecisionRequest。 */
  pendingDecision?: DecisionRequest;
  /** 按 Event 顺序保存的不可变 Artifact Revision。 */
  artifacts: readonly SupportedArtifact[];
  /** 按 Event 顺序保存的 Human Approval Record。 */
  approvals: readonly ApprovalRecord[];
}

/** ArtifactCommitted Event 的 Payload。 */
export interface ArtifactCommittedPayload {
  /** 已完成 Schema、Digest 和 Policy 校验的 Artifact。 */
  artifact: SupportedArtifact;
  /** Core 对该 Artifact 重算得到的 Gate Evaluation。 */
  gateEvaluation: GateEvaluation;
  /** WaitingHuman 时创建的唯一 DecisionRequest。 */
  decisionRequest?: DecisionRequest;
}

/** ApprovalRecorded Event 的 Payload。 */
export interface ApprovalRecordedPayload {
  /** 由 Human 输入产生并绑定精确 Digest 的 Approval。 */
  approval: ApprovalRecord;
  /** 加入 Approval 后由 Core 重算得到的 Gate Evaluation。 */
  gateEvaluation: GateEvaluation;
}

/** Append-only Store 中的一条 ArtifactCommitted Event。 */
export interface ArtifactCommittedEventRecord {
  /** Task Event Schema Version。 */
  schemaVersion: TaskEventRecord["schemaVersion"];
  /** Event 的稳定 ULID。 */
  eventId: EventId;
  /** Event 所属 Task。 */
  taskId: TaskId;
  /** Event 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** Task 内从 1 开始严格递增的序号。 */
  sequence: number;
  /** 当前 Event 类别。 */
  type: TaskRunEventType.ArtifactCommitted;
  /** Event 发生时间。 */
  occurredAt: string;
  /** 触发 Event 的 Actor。 */
  actor: TaskEventRecord["actor"];
  /** Artifact Commit 与 Gate 结果。 */
  payload: ArtifactCommittedPayload;
  /** 前一条 Event Hash。 */
  previousHash: string;
  /** 当前 Event 内容计算出的 SHA-256 Hash。 */
  hash: string;
}

/** Append-only Store 中的一条 ApprovalRecorded Event。 */
export interface ApprovalRecordedEventRecord {
  /** Task Event Schema Version。 */
  schemaVersion: TaskEventRecord["schemaVersion"];
  /** Event 的稳定 ULID。 */
  eventId: EventId;
  /** Event 所属 Task。 */
  taskId: TaskId;
  /** Event 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** Task 内从 1 开始严格递增的序号。 */
  sequence: number;
  /** 当前 Event 类别。 */
  type: TaskRunEventType.ApprovalRecorded;
  /** Event 发生时间。 */
  occurredAt: string;
  /** 触发 Event 的 Human Actor。 */
  actor: TaskEventRecord["actor"];
  /** Approval 与重算后的 Gate 结果。 */
  payload: ApprovalRecordedPayload;
  /** 前一条 Event Hash。 */
  previousHash: string;
  /** 当前 Event 内容计算出的 SHA-256 Hash。 */
  hash: string;
}

/** 当前 Event Store 支持的完整 Task Event union。 */
export type TaskRunEventRecord =
  TaskEventRecord | ArtifactCommittedEventRecord | ApprovalRecordedEventRecord;

/** 完整 Task Aggregate 和 Event Tail。 */
export interface TaskAggregateRecord {
  /** 由 Event Replay 得到的权威聚合。 */
  aggregate: TaskAggregate;
  /** 已应用的最后 Event Sequence。 */
  lastSequence: number;
  /** 已应用的最后 Event Hash。 */
  lastEventHash: string;
}

/** 新版 Snapshot 保存完整 Task Aggregate 和对应 Event Tail。 */
export interface TaskAggregateSnapshot {
  /** Task Aggregate Snapshot Schema Version。 */
  schemaVersion: typeof TASK_AGGREGATE_SNAPSHOT_SCHEMA_VERSION;
  /** Snapshot 对应的 Task Aggregate。 */
  aggregate: TaskAggregate;
  /** Snapshot 已应用的最后 Event Sequence。 */
  lastSequence: number;
  /** Snapshot 已应用的最后 Event Hash。 */
  lastEventHash: string;
}

/** 旧 Task-only Snapshot 与新版 Aggregate Snapshot 的兼容 union。 */
export type PersistedTaskSnapshot = TaskSnapshot | TaskAggregateSnapshot;
