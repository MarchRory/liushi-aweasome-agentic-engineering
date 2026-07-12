import type { ActorRef } from "#common/index.js";
import type { ApprovalDecision, ApprovalId, DecisionRequestId } from "#domain/approval/index.js";
import type { ArtifactDigest, ArtifactId, ArtifactType } from "#domain/artifact/index.js";
import type { GateEvaluationResult, GateId } from "#domain/policy/index.js";
import type { EventId, TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { TASK_TIMELINE_PROJECTION_SCHEMA_VERSION } from "./taskTimeline.constants.js";
import type { TaskTimelineEntryKind } from "./taskTimeline.enums.js";

/** Task Timeline Projection 的只读根契约。 */
export interface TaskTimelineProjection {
  /** Projection Schema 版本。 */
  readonly schemaVersion: typeof TASK_TIMELINE_PROJECTION_SCHEMA_VERSION;
  /** Projection 对应的 Workspace ID。 */
  readonly workspaceId: WorkspaceId;
  /** Projection 对应的 Task ID。 */
  readonly taskId: TaskId;
  /** Event 历史中最后一个 Sequence。 */
  readonly lastSequence: number;
  /** Event 历史中最后一个 Hash。 */
  readonly lastEventHash: string;
  /** 按 Sequence 稳定排序的只读 Timeline 条目。 */
  readonly entries: readonly TaskTimelineEntry[];
}

/** Timeline 条目的公共只读字段。 */
export interface TaskTimelineEntryBase {
  /** 原 Event 的稳定 ID。 */
  readonly eventId: EventId;
  /** 原 Event 的 Task 内序号。 */
  readonly sequence: number;
  /** Timeline 的封闭条目类别。 */
  readonly kind: TaskTimelineEntryKind;
  /** Event 发生时间。 */
  readonly occurredAt: string;
  /** 触发 Event 的 Actor 引用。 */
  readonly actor: ActorRef;
}

/** TaskCreated 对应的最小 Timeline 条目。 */
export interface TaskCreatedTimelineEntry extends TaskTimelineEntryBase {
  /** 条目类别固定为 TaskCreated。 */
  readonly kind: TaskTimelineEntryKind.TaskCreated;
  /** 创建 Task 时提供的外部来源。 */
  readonly source?: string;
}

/** ArtifactCommitted 对应的最小 Timeline 条目。 */
export interface ArtifactCommittedTimelineEntry extends TaskTimelineEntryBase {
  /** 条目类别固定为 ArtifactCommitted。 */
  readonly kind: TaskTimelineEntryKind.ArtifactCommitted;
  /** 提交的 Artifact ID。 */
  readonly artifactId: ArtifactId;
  /** 提交的 Artifact 类型。 */
  readonly artifactType: ArtifactType;
  /** 提交的 Artifact Revision。 */
  readonly revision: number;
  /** 提交的 Artifact Digest。 */
  readonly digest: ArtifactDigest;
  /** 当前提交对应的 Gate；没有 Gate 时省略。 */
  readonly gate?: GateId;
  /** 当前提交的 Gate 结果。 */
  readonly gateResult: GateEvaluationResult;
  /** 等待 Human 决策时的 Request ID。 */
  readonly decisionRequestId?: DecisionRequestId;
}

/** ApprovalRecorded 对应的最小 Timeline 条目。 */
export interface ApprovalRecordedTimelineEntry extends TaskTimelineEntryBase {
  /** 条目类别固定为 ApprovalRecorded。 */
  readonly kind: TaskTimelineEntryKind.ApprovalRecorded;
  /** 人工审批记录的稳定 ID。 */
  readonly approvalId: ApprovalId;
  /** Human 提交的封闭决策。 */
  readonly decision: ApprovalDecision;
  /** Approval 绑定的 Gate。 */
  readonly gate: GateId;
  /** Approval 绑定的 Artifact ID。 */
  readonly artifactId: ArtifactId;
  /** Approval 绑定的 Artifact Digest。 */
  readonly artifactDigest: ArtifactDigest;
}

/** Timeline 对外暴露的封闭条目 union。 */
export type TaskTimelineEntry =
  TaskCreatedTimelineEntry | ArtifactCommittedTimelineEntry | ApprovalRecordedTimelineEntry;
