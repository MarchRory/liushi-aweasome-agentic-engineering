import type { ActorRef, CODING_TASK_EVENT_SCHEMA_VERSION } from "#common/index.js";
import type { InputBindingSet } from "#domain/workflow/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type {
  CodingTaskAttemptOutcome,
  CodingTaskControlAction,
  CodingTaskHumanResolution,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
} from "../enums/index.js";
import type { FailureTaxonomy } from "#domain/workflow/index.js";
import type { CodingTaskEventId, CodingTaskId } from "../identifiers/index.js";
import type { CodingTaskEventType } from "./codingTaskEventEnums.js";
import type { CodingTaskCreatedPayload } from "../contracts/index.js";

/** CodingTask Event 的公共完整字段。 */
export interface CodingTaskEventBase {
  /** Event Schema 版本。 */
  schemaVersion: typeof CODING_TASK_EVENT_SCHEMA_VERSION;
  /** Event 稳定标识。 */
  eventId: CodingTaskEventId;
  /** 所属 CodingTask。 */
  codingTaskId: CodingTaskId;
  /** 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 严格递增的事件序号。 */
  sequence: number;
  /** 事件类型。 */
  type: CodingTaskEventType;
  /** 产生事件的命令标识。 */
  commandId: string;
  /** 请求关联标识。 */
  correlationId: string;
  /** 直接因果事件标识。 */
  causationId?: string;
  /** 事件发生时间。 */
  occurredAt: string;
  /** 事件 Actor。 */
  actor: ActorRef;
  /** 前一事件哈希。 */
  previousHash: string;
  /** 当前事件哈希。 */
  hash: string;
}

/** 事件草稿的公共字段，序号和哈希由 Store 补齐。 */
export interface CodingTaskEventDraftBase {
  /** Event Schema 版本。 */
  schemaVersion: typeof CODING_TASK_EVENT_SCHEMA_VERSION;
  /** Event 稳定标识。 */
  eventId: CodingTaskEventId;
  /** 所属 CodingTask。 */
  codingTaskId: CodingTaskId;
  /** 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 事件类型。 */
  type: CodingTaskEventType;
  /** 产生事件的命令标识。 */
  commandId: string;
  /** 请求关联标识。 */
  correlationId: string;
  /** 直接因果事件标识。 */
  causationId?: string;
  /** 事件发生时间。 */
  occurredAt: string;
  /** 事件 Actor。 */
  actor: ActorRef;
}

/** AttemptStarted 事件载荷。 */
export interface AttemptStartedPayload {
  /** Attempt 序号。 */
  attemptNumber: number;
}

/** AttemptFinished 事件载荷。 */
export interface AttemptFinishedPayload {
  /** Attempt 序号。 */
  attemptNumber: number;
  /** 实现尝试结果。 */
  outcome: CodingTaskAttemptOutcome;
  /** 失败分类；成功结果不允许携带该字段。 */
  failureTaxonomy?: FailureTaxonomy;
}

/** ImplementationSubmitted 事件载荷。 */
export interface ImplementationSubmittedPayload {
  /** 被提交的 Attempt 序号。 */
  attemptNumber: number;
  /** 实现提交对应的目标 Revision。 */
  targetRevision: string;
  /** 按原始顺序记录且非空的变更路径。 */
  changedPaths: readonly string[];
}

/** VerificationRequested 事件载荷。 */
export interface VerificationRequestedPayload {
  /** 请求验证的 Attempt 序号。 */
  attemptNumber: number;
}

/** VerificationFinished 事件载荷。 */
export interface VerificationFinishedPayload {
  /** 被验证的 Attempt 序号。 */
  attemptNumber: number;
  /** 验证结果。 */
  outcome: CodingTaskVerificationOutcome;
  /** 验证失败分类；通过结果不允许携带该字段。 */
  failureTaxonomy?: FailureTaxonomy;
}

/** HumanControlApplied 事件载荷。 */
export interface HumanControlAppliedPayload {
  /** Human 控制动作。 */
  action: CodingTaskControlAction;
  /** 控制前状态。 */
  fromState: CodingTaskRunState;
  /** 控制后状态。 */
  toState: CodingTaskRunState;
  /** 该动作必须由 Human 发起。 */
  requiresHuman: true;
}

/** HumanResolutionApplied 事件载荷。 */
export interface HumanResolutionAppliedPayload {
  /** Human 对阻塞 Attempt 的处置动作。 */
  resolution: CodingTaskHumanResolution;
  /** 控制前状态固定为 WaitingHuman。 */
  fromState: CodingTaskRunState.WaitingHuman;
  /** 控制后的状态。 */
  toState: CodingTaskRunState.Active | CodingTaskRunState.Cancelled;
  /** 恢复实现时 Human 重新确认的输入绑定。 */
  inputBindingSet?: InputBindingSet;
  /** 该动作必须由 Human 发起。 */
  requiresHuman: true;
}

/** CodingTask 创建语义事件。 */
export interface CodingTaskCreatedEvent extends CodingTaskEventBase {
  /** Event 类型固定为 CodingTaskCreated。 */
  type: CodingTaskEventType.CodingTaskCreated;
  /** 创建 CodingTask 的初始绑定。 */
  payload: CodingTaskCreatedPayload;
}

/** Attempt 开始语义事件。 */
export interface AttemptStartedEvent extends CodingTaskEventBase {
  /** Event 类型固定为 AttemptStarted。 */
  type: CodingTaskEventType.AttemptStarted;
  /** Attempt 开始参数。 */
  payload: AttemptStartedPayload;
}

/** Attempt 结束语义事件。 */
export interface AttemptFinishedEvent extends CodingTaskEventBase {
  /** Event 类型固定为 AttemptFinished。 */
  type: CodingTaskEventType.AttemptFinished;
  /** Attempt 结果和失败分类。 */
  payload: AttemptFinishedPayload;
}

/** 实现提交并进入 Verification 的单一语义事件。 */
export interface ImplementationSubmittedEvent extends CodingTaskEventBase {
  /** Event 类型固定为 ImplementationSubmitted。 */
  type: CodingTaskEventType.ImplementationSubmitted;
  /** 实现提交的 Revision 和有序变更路径。 */
  payload: ImplementationSubmittedPayload;
}

/** 请求进入 Verification 阶段的语义事件。 */
export interface VerificationRequestedEvent extends CodingTaskEventBase {
  /** Event 类型固定为 VerificationRequested。 */
  type: CodingTaskEventType.VerificationRequested;
  /** 请求验证的 Attempt。 */
  payload: VerificationRequestedPayload;
}

/** Verification 结果接纳语义事件。 */
export interface VerificationFinishedEvent extends CodingTaskEventBase {
  /** Event 类型固定为 VerificationFinished。 */
  type: CodingTaskEventType.VerificationFinished;
  /** Verification 结果和失败分类。 */
  payload: VerificationFinishedPayload;
}

/** Human 控制语义事件。 */
export interface HumanControlAppliedEvent extends CodingTaskEventBase {
  /** Event 类型固定为 HumanControlApplied。 */
  type: CodingTaskEventType.HumanControlApplied;
  /** Human 控制动作和确定性状态迁移。 */
  payload: HumanControlAppliedPayload;
}

/** Human 处置阻塞 Attempt 的语义事件。 */
export interface HumanResolutionAppliedEvent extends CodingTaskEventBase {
  /** Event 类型固定为 HumanResolutionApplied。 */
  type: CodingTaskEventType.HumanResolutionApplied;
  /** Human 处置动作和新的输入绑定。 */
  payload: HumanResolutionAppliedPayload;
}

/** CodingTask Event 的完整联合类型。 */
export type CodingTaskEvent =
  | CodingTaskCreatedEvent
  | AttemptStartedEvent
  | AttemptFinishedEvent
  | ImplementationSubmittedEvent
  | VerificationRequestedEvent
  | VerificationFinishedEvent
  | HumanControlAppliedEvent
  | HumanResolutionAppliedEvent;

/** CodingTask 创建事件草稿。 */
export interface CodingTaskCreatedEventDraft extends CodingTaskEventDraftBase {
  /** Event 类型固定为 CodingTaskCreated。 */
  type: CodingTaskEventType.CodingTaskCreated;
  /** 创建 CodingTask 的初始绑定。 */
  payload: CodingTaskCreatedPayload;
}

/** Attempt 开始事件草稿。 */
export interface AttemptStartedEventDraft extends CodingTaskEventDraftBase {
  /** Event 类型固定为 AttemptStarted。 */
  type: CodingTaskEventType.AttemptStarted;
  /** Attempt 开始参数。 */
  payload: AttemptStartedPayload;
}

/** Attempt 结束事件草稿。 */
export interface AttemptFinishedEventDraft extends CodingTaskEventDraftBase {
  /** Event 类型固定为 AttemptFinished。 */
  type: CodingTaskEventType.AttemptFinished;
  /** Attempt 结果和失败分类。 */
  payload: AttemptFinishedPayload;
}

/** 实现提交事件草稿。 */
export interface ImplementationSubmittedEventDraft extends CodingTaskEventDraftBase {
  /** Event 类型固定为 ImplementationSubmitted。 */
  type: CodingTaskEventType.ImplementationSubmitted;
  /** 实现提交的 Revision 和有序变更路径。 */
  payload: ImplementationSubmittedPayload;
}

/** Verification 请求事件草稿。 */
export interface VerificationRequestedEventDraft extends CodingTaskEventDraftBase {
  /** Event 类型固定为 VerificationRequested。 */
  type: CodingTaskEventType.VerificationRequested;
  /** 请求验证的 Attempt。 */
  payload: VerificationRequestedPayload;
}

/** Verification 结果事件草稿。 */
export interface VerificationFinishedEventDraft extends CodingTaskEventDraftBase {
  /** Event 类型固定为 VerificationFinished。 */
  type: CodingTaskEventType.VerificationFinished;
  /** Verification 结果和失败分类。 */
  payload: VerificationFinishedPayload;
}

/** Human 控制事件草稿。 */
export interface HumanControlAppliedEventDraft extends CodingTaskEventDraftBase {
  /** Event 类型固定为 HumanControlApplied。 */
  type: CodingTaskEventType.HumanControlApplied;
  /** Human 控制动作和确定性状态迁移。 */
  payload: HumanControlAppliedPayload;
}

/** Human 处置事件草稿。 */
export interface HumanResolutionAppliedEventDraft extends CodingTaskEventDraftBase {
  /** Event 类型固定为 HumanResolutionApplied。 */
  type: CodingTaskEventType.HumanResolutionApplied;
  /** Human 处置动作和新的输入绑定。 */
  payload: HumanResolutionAppliedPayload;
}

/** CodingTask Event 草稿联合类型。 */
export type CodingTaskEventDraft =
  | CodingTaskCreatedEventDraft
  | AttemptStartedEventDraft
  | AttemptFinishedEventDraft
  | ImplementationSubmittedEventDraft
  | VerificationRequestedEventDraft
  | VerificationFinishedEventDraft
  | HumanControlAppliedEventDraft
  | HumanResolutionAppliedEventDraft;
