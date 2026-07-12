import type { ActorRef, ContentDigest } from "#common/index.js";
import type {
  ActionId,
  ActionKind,
  ActionOutcome,
  ActionJournalStatus,
} from "#domain/actionJournal/index.js";
import type { ArtifactDigest, ArtifactId } from "#domain/artifact/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { CommandReceipt } from "../../command/index.js";
import type { SpanId, TraceId } from "../../observability/index.js";
import type { CANONICAL_HOOK_SCHEMA_VERSION } from "../constants/index.js";
import type {
  HarnessHookEvent,
  HookDecision,
  HookExecutorKind,
  HookFailureKind,
} from "../enums/index.js";

/** PreAction 与 PostAction 共用的 Task、因果和 Actor 字段。 */
export interface ActionHookPayloadBase {
  /** Canonical Hook Schema 版本。 */
  readonly schemaVersion: typeof CANONICAL_HOOK_SCHEMA_VERSION;
  /** 当前 Canonical 生命周期事件。 */
  readonly event: HarnessHookEvent;
  /** 单次 Hook Handler 执行标识。 */
  readonly hookExecutionId: string;
  /** Executor 家族。 */
  readonly executor: HookExecutorKind;
  /** 执行器会话 ID。 */
  readonly sessionId: string;
  /** 执行器轮次 ID。 */
  readonly turnId: string;
  /** 当前工作区 Workspace ID。 */
  readonly workspaceId: WorkspaceId;
  /** 当前任务 Task ID。 */
  readonly taskId: TaskId;
  /** 当前 Action ID。 */
  readonly actionId: ActionId;
  /** 记录 Hook 的 Agent Actor。 */
  readonly actor: ActorRef;
  /** Action 所属 Application Command ID。 */
  readonly commandId: string;
  /** 贯穿当前执行链的 Correlation ID。 */
  readonly correlationId: string;
  /** 直接触发当前 Action 的 Causation ID。 */
  readonly causationId?: string;
  /** Executor 调用当前 Hook 的时间。 */
  readonly occurredAt: string;
}

/** 执行副作用前提供给 Canonical Dispatcher 的严格 Payload。 */
export interface PreActionHookPayload extends ActionHookPayloadBase {
  /** 当前事件固定为 PreAction。 */
  readonly event: HarnessHookEvent.PreAction;
  /** Action 幂等键。 */
  readonly idempotencyKey: string;
  /** 副作用类别。 */
  readonly actionKind: ActionKind;
  /** Executor 解析出的全部规范目标。 */
  readonly targets: readonly string[];
  /** 规范化 Tool Input Digest。 */
  readonly inputDigest: ContentDigest;
  /** 期望后置条件定义 Digest。 */
  readonly postconditionDigest: ContentDigest;
  /** 执行前 Revision。 */
  readonly baseRevision?: string;
  /** 失败或未知时的恢复说明。 */
  readonly recoveryGuidance: string;
  /** 授权当前动作的 PlanRisk Artifact ID。 */
  readonly planRiskArtifactId: ArtifactId;
  /** 授权当前动作的 PlanRisk Artifact Digest。 */
  readonly planRiskArtifactDigest: ArtifactDigest;
}

/** 执行副作用后提供给 Canonical Dispatcher 的严格 Payload。 */
export interface PostActionHookPayload extends ActionHookPayloadBase {
  /** 当前事件固定为 PostAction。 */
  readonly event: HarnessHookEvent.PostAction;
  /** 必须精确指向创建 Action Intent 的 PreAction Command。 */
  readonly causationId: string;
  /** 证据支持的 Action 结果。 */
  readonly outcome: ActionOutcome;
  /** 支撑结果判定的 Evidence ID。 */
  readonly evidenceIds: readonly string[];
  /** 规范化 Tool Output Digest。 */
  readonly outputDigest?: ContentDigest;
  /** 失败或未知时的稳定错误码。 */
  readonly errorCode?: string;
  /** W3C 追踪 ID。 */
  readonly traceId: TraceId;
  /** 当前 Tool Span ID。 */
  readonly spanId: SpanId;
  /** 可选父 Span ID。 */
  readonly parentSpanId?: SpanId;
  /** Executor Tool 名称。 */
  readonly toolName: string;
  /** 执行器工具调用 ID。 */
  readonly toolCallId: string;
  /** Tool 开始时间。 */
  readonly startedAt: string;
  /** Tool 结束时间。 */
  readonly endedAt: string;
}

/** 当前切片支持的 Canonical Action Hook Payload。 */
export type ActionHookPayload = PreActionHookPayload | PostActionHookPayload;

/** Canonical Hook Dispatcher 的稳定结果。 */
export interface HookDispatchResult {
  /** Hook Result Schema 版本。 */
  readonly schemaVersion: typeof CANONICAL_HOOK_SCHEMA_VERSION;
  /** 已处理的 Canonical Event。 */
  readonly event: HarnessHookEvent;
  /** Executor 后续行为。 */
  readonly decision: HookDecision;
  /** 面向 Human 与 Agent 的稳定说明。 */
  readonly reason: string;
  /** Gateway 返回的稳定 Receipt。 */
  readonly receipt: CommandReceipt;
  /** Hook 被阻断或降级时的稳定分类。 */
  readonly failureKind?: HookFailureKind;
  /** Action Journal 当前状态。 */
  readonly actionStatus?: ActionJournalStatus;
}
