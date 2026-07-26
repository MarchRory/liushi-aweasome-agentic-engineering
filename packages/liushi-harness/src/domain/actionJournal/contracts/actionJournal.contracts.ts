import type { ActorRef, ContentDigest } from "#common/index.js";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type {
  ACTION_JOURNAL_SCHEMA_VERSION,
  SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
} from "../constants/index.js";
import type {
  ActionJournalStatus,
  ActionJournalRecordType,
  ActionKind,
  ActionOutcome,
  ActionResolution,
  SessionActionTraceDisposition,
  SessionActionTraceDropReason,
} from "../enums/index.js";
import type { ActionId } from "../identity/index.js";

/** Session Action record 绑定的不可变会话来源证据。 */
export interface SessionActionProvenance {
  /** Coding Task Session 的稳定标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** Coding Task 的稳定标识。 */
  readonly codingTaskId: CodingTaskId;
  /** Session 内从 1 开始的执行尝试编号。 */
  readonly attemptNumber: number;
  /** 受 Harness 管理的 Worktree 标识。 */
  readonly worktreeId: string;
  /** Worktree root 状态的内容摘要。 */
  readonly worktreeRootDigest: ContentDigest;
  /** Session activation binding 的内容摘要。 */
  readonly activationBindingDigest: ContentDigest;
  /** 当前 Session binding 的内容摘要。 */
  readonly sessionBindingDigest: ContentDigest;
  /** 外部 Executor Session ID 的内容摘要。 */
  readonly executorSessionIdDigest: ContentDigest;
}

/** Session Action Observation 中可安全持久化的 Trace 证据。 */
export interface SessionActionTraceEvidence {
  /** Trace 写入结果。 */
  readonly disposition: SessionActionTraceDisposition;
  /** Trace 被丢弃时的领域原因。 */
  readonly dropReason?: SessionActionTraceDropReason;
  /** 仅保存 recovery path 的摘要，不保存本机原始路径。 */
  readonly recoveryPathDigests: readonly ContentDigest[];
}

/** Action Journal 1.0.0 的 legacy Intent record。 */
export interface LegacyActionIntentRecord {
  /** Legacy Action Journal Schema 版本。 */
  readonly schemaVersion: typeof ACTION_JOURNAL_SCHEMA_VERSION;
  /** record 类型固定为 Intent。 */
  readonly recordType: ActionJournalRecordType.Intent;
  /** Action 的稳定标识。 */
  readonly actionId: ActionId;
  /** Intent 在当前 Action Journal 中固定为第 1 条。 */
  readonly sequence: 1;
  /** Action 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Action 所属 Task。 */
  readonly taskId: TaskId;
  /** 发起 Action 的 Application Command。 */
  readonly commandId: string;
  /** 完整调用链的稳定标识。 */
  readonly correlationId: string;
  /** 直接触发 Action 的上游标识。 */
  readonly causationId?: string;
  /** 防止副作用重复执行的稳定幂等键。 */
  readonly idempotencyKey: string;
  /** Action 的封闭副作用类别。 */
  readonly kind: ActionKind;
  /** 不包含 Secret 的目标资源描述。 */
  readonly target: string;
  /** 规范化 Action 输入的内容摘要。 */
  readonly inputDigest: ContentDigest;
  /** 期望后置条件的内容摘要。 */
  readonly postconditionDigest: ContentDigest;
  /** 执行前资源 Revision。 */
  readonly baseRevision?: string;
  /** 失败或未知时供 Human 使用的恢复说明。 */
  readonly recoveryGuidance: string;
  /** 记录 Intent 的 Actor。 */
  readonly actor: ActorRef;
  /** Intent 持久化时间。 */
  readonly recordedAt: string;
}

/** Action Journal 2.0.0 的 Session Intent record。 */
export interface SessionActionIntentRecord extends Omit<LegacyActionIntentRecord, "schemaVersion"> {
  /** Session Action Journal Schema 版本。 */
  readonly schemaVersion: typeof SESSION_ACTION_JOURNAL_SCHEMA_VERSION;
  /** 显式、规范、非空、排序去重的目标集合。 */
  readonly targets: readonly string[];
  /** 该 Action 所属 Session 的来源证据。 */
  readonly sessionProvenance: SessionActionProvenance;
}

/** Action Journal 1.0.0 的 legacy Observation record。 */
export interface LegacyActionObservationRecord {
  /** Legacy Action Journal Schema 版本。 */
  readonly schemaVersion: typeof ACTION_JOURNAL_SCHEMA_VERSION;
  /** record 类型固定为 Observation。 */
  readonly recordType: ActionJournalRecordType.Observation;
  /** Observation 所属 Action。 */
  readonly actionId: ActionId;
  /** Action 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Action 所属 Task。 */
  readonly taskId: TaskId;
  /** Action Journal 内严格递增的记录序号。 */
  readonly sequence: number;
  /** 本次执行或恢复检查的封闭结果。 */
  readonly outcome: ActionOutcome;
  /** 支持结果判定的 Evidence ID。 */
  readonly evidenceIds: readonly string[];
  /** 可选的规范化输出摘要。 */
  readonly outputDigest?: ContentDigest;
  /** 失败时的稳定错误分类。 */
  readonly errorCode?: string;
  /** 记录 Observation 的 Actor。 */
  readonly actor: ActorRef;
  /** Observation 记录时间。 */
  readonly recordedAt: string;
}

/** Action Journal 2.0.0 的 Session Observation record。 */
export interface SessionActionObservationRecord extends Omit<
  LegacyActionObservationRecord,
  "schemaVersion"
> {
  /** Session Action Journal Schema 版本。 */
  readonly schemaVersion: typeof SESSION_ACTION_JOURNAL_SCHEMA_VERSION;
  /** 与 Intent 完全一致的 Session 来源证据。 */
  readonly sessionProvenance: SessionActionProvenance;
  /** 与 Intent 完全一致的规范化目标集合。 */
  readonly targets: readonly string[];
  /** Trace 写入与恢复路径摘要证据。 */
  readonly trace: SessionActionTraceEvidence;
}

/** Action Journal 的兼容 Intent union。 */
export type ActionIntentRecord = LegacyActionIntentRecord | SessionActionIntentRecord;

/** Action Journal 的兼容 Observation union。 */
export type ActionObservationRecord =
  LegacyActionObservationRecord | SessionActionObservationRecord;

/** 对最新 Observation 作出的不可变 Resolution record。 */
export interface ActionResolutionRecord {
  /** Action Journal Schema 版本。 */
  readonly schemaVersion: typeof ACTION_JOURNAL_SCHEMA_VERSION;
  /** record 类型固定为 Resolution。 */
  readonly recordType: ActionJournalRecordType.Resolution;
  /** Resolution 所属 Action。 */
  readonly actionId: ActionId;
  /** Action 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Action 所属 Task。 */
  readonly taskId: TaskId;
  /** Action Journal 内严格递增的记录序号。 */
  readonly sequence: number;
  /** 对最新 Observation 的封闭处置。 */
  readonly resolution: ActionResolution;
  /** 可审计的处置原因。 */
  readonly reason: string;
  /** 记录处置的 Actor。 */
  readonly actor: ActorRef;
  /** Resolution 记录时间。 */
  readonly recordedAt: string;
}

/** Action Journal 允许追加和重放的完整 record 集合。 */
export type ActionJournalRecord =
  ActionIntentRecord | ActionObservationRecord | ActionResolutionRecord;

/** 一个 Action 的可恢复 Journal 状态。 */
export interface ActionJournalState {
  /** 不可变的 Action Intent。 */
  readonly intent: ActionIntentRecord;
  /** 按序保存的全部 Observation。 */
  readonly observations: readonly ActionObservationRecord[];
  /** 按序保存的全部处置记录。 */
  readonly resolutions: readonly ActionResolutionRecord[];
  /** 当前严格递增的最后记录序号。 */
  readonly lastSequence: number;
  /** 根据记录确定性归纳得到的当前状态。 */
  readonly status: ActionJournalStatus;
}
