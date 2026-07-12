import type { ActorRef, WORKFLOW_EVENT_SCHEMA_VERSION } from "#common/index.js";
import type { ContextManifest, EffectiveRevisionSet, InputBindingSet } from "../contracts/index.js";
import type { WorkflowCellKind } from "../enums/index.js";
import type { WorkflowId, WorkflowEventId } from "../identifiers/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";
import type {
  FailureTaxonomy,
  WorkflowControlAction,
  WorkflowKind,
  WorkflowRouteKind,
  WorkflowRunState,
} from "../enums/index.js";
import type { WorkflowEventType } from "./workflowEventEnums.js";

/** 所有 Workflow Event 共用的可追溯字段。 */
export interface WorkflowEventBase {
  /** Event Schema 版本。 */
  schemaVersion: typeof WORKFLOW_EVENT_SCHEMA_VERSION;
  /** Event 的稳定 ULID。 */
  eventId: WorkflowEventId;
  /** Event 所属 Workflow。 */
  workflowId: WorkflowId;
  /** Event 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 从 1 开始严格递增的 Event 序号。 */
  sequence: number;
  /** Event 类型。 */
  type: WorkflowEventType;
  /** 产生该 Event 的 Command。 */
  commandId: string;
  /** 贯穿一次需求生命周期的关联 ID。 */
  correlationId: string;
  /** 直接触发本次 Command 的上游 ID。 */
  causationId?: string;
  /** Event 发生时间。 */
  occurredAt: string;
  /** Event 的 Actor。 */
  actor: ActorRef;
  /** 前一条 Event 的 Hash。 */
  previousHash: string;
  /** 当前 Event 的 SHA-256 Hash。 */
  hash: string;
}

/** Workflow 创建事件的业务 Payload。 */
export interface WorkflowCreatedPayload {
  /** 创建的 Workflow 类型。 */
  workflowKind: WorkflowKind.Requirement;
  /** 固定从 PRD Intake 开始。 */
  initialCell: WorkflowCellKind.PrdIntake;
  /** 创建后允许执行下一个 Cell。 */
  initialState: WorkflowRunState.Active;
  /** 创建时显式绑定的有效 Artifact Revision。 */
  effectiveRevisionSet: EffectiveRevisionSet;
  /** 创建时显式绑定的输入 Revision。 */
  inputBindingSet: InputBindingSet;
  /** 创建时显式选择的上下文来源。 */
  contextManifest: ContextManifest;
}

/** Cell 路由事件的业务 Payload。 */
export interface WorkflowCellRoutedPayload {
  /** 路由发生前的 Cell。 */
  fromCell: WorkflowCellKind;
  /** 路由发生后的 Cell。 */
  toCell: WorkflowCellKind;
  /** 路由语义。 */
  routeKind: WorkflowRouteKind;
  /** Verification 失败分类。 */
  failureTaxonomy?: FailureTaxonomy;
  /** 是否必须由 Human 继续决策。 */
  requiresHuman: boolean;
}

/** Human 控制事件的业务 Payload。 */
export interface WorkflowControlAppliedPayload {
  /** Human 发起的控制动作。 */
  action: WorkflowControlAction;
  /** 控制前的状态。 */
  fromState: WorkflowRunState;
  /** 控制后的状态。 */
  toState: WorkflowRunState;
  /** 该动作必须由 Human 发起。 */
  requiresHuman: true;
}

/** Workflow 创建语义事件。 */
export interface WorkflowCreatedEvent extends WorkflowEventBase {
  /** Event 类型固定为 WorkflowCreated。 */
  type: WorkflowEventType.WorkflowCreated;
  /** 创建 Workflow 的初始上下文。 */
  payload: WorkflowCreatedPayload;
}

/** Workflow Cell 路由语义事件。 */
export interface WorkflowCellRoutedEvent extends WorkflowEventBase {
  /** Event 类型固定为 CellRouted。 */
  type: WorkflowEventType.CellRouted;
  /** Cell 路由的确定性结果。 */
  payload: WorkflowCellRoutedPayload;
}

/** Workflow Human 控制语义事件。 */
export interface WorkflowControlAppliedEvent extends WorkflowEventBase {
  /** Event 类型固定为 ControlApplied。 */
  type: WorkflowEventType.ControlApplied;
  /** Human 控制动作的确定性结果。 */
  payload: WorkflowControlAppliedPayload;
}

/** Workflow Event 的完整联合类型。 */
export type WorkflowEvent =
  WorkflowCreatedEvent | WorkflowCellRoutedEvent | WorkflowControlAppliedEvent;

/** 由 Application 生成、由 Store 补齐序号和 Hash 的 Event 草稿公共字段。 */
export interface WorkflowEventDraftBase {
  /** Event Schema 版本。 */
  schemaVersion: typeof WORKFLOW_EVENT_SCHEMA_VERSION;
  /** Event 的稳定 ULID。 */
  eventId: WorkflowEventId;
  /** Event 所属 Workflow。 */
  workflowId: WorkflowId;
  /** Event 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 产生该 Event 的 Command。 */
  commandId: string;
  /** 贯穿一次需求生命周期的关联 ID。 */
  correlationId: string;
  /** 直接触发本次 Command 的上游 ID。 */
  causationId?: string;
  /** Event 发生时间。 */
  occurredAt: string;
  /** Event 的 Actor。 */
  actor: ActorRef;
}

/** 由 Application 生成、由 Store 补齐序号和 Hash 的创建事件草稿。 */
export interface WorkflowCreatedEventDraft extends WorkflowEventDraftBase {
  /** Event 类型固定为 WorkflowCreated。 */
  type: WorkflowEventType.WorkflowCreated;
  /** 创建 Workflow 的初始上下文。 */
  payload: WorkflowCreatedPayload;
}

/** 由 Application 生成、由 Store 补齐序号和 Hash 的 Cell 路由事件草稿。 */
export interface WorkflowCellRoutedEventDraft extends WorkflowEventDraftBase {
  /** Event 类型固定为 CellRouted。 */
  type: WorkflowEventType.CellRouted;
  /** Cell 路由的确定性结果。 */
  payload: WorkflowCellRoutedPayload;
}

/** 由 Application 生成、由 Store 补齐序号和 Hash 的 Human 控制事件草稿。 */
export interface WorkflowControlAppliedEventDraft extends WorkflowEventDraftBase {
  /** Event 类型固定为 ControlApplied。 */
  type: WorkflowEventType.ControlApplied;
  /** Human 控制动作的确定性结果。 */
  payload: WorkflowControlAppliedPayload;
}

/** Workflow Event 草稿联合类型。 */
export type WorkflowEventDraft =
  WorkflowCreatedEventDraft | WorkflowCellRoutedEventDraft | WorkflowControlAppliedEventDraft;
