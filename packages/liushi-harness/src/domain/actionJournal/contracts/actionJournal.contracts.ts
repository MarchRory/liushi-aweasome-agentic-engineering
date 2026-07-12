import type { ActorRef, ContentDigest } from "#common/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { ACTION_JOURNAL_SCHEMA_VERSION } from "../constants/index.js";
import type {
  ActionJournalStatus,
  ActionJournalRecordType,
  ActionKind,
  ActionOutcome,
  ActionResolution,
} from "../enums/index.js";
import type { ActionId } from "../identity/index.js";

/** 执行副作用前必须持久化的 Action Intent。 */
export interface ActionIntentRecord {
  /** Action Journal Schema 版本。 */
  readonly schemaVersion: typeof ACTION_JOURNAL_SCHEMA_VERSION;
  /** Record 类别固定为 Action Intent。 */
  readonly recordType: ActionJournalRecordType.Intent;
  /** Action 的稳定标识。 */
  readonly actionId: ActionId;
  /** Intent 在当前 Action Journal 中固定为 1 的序号。 */
  readonly sequence: 1;
  /** Action 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Action 所属 Task。 */
  readonly taskId: TaskId;
  /** 发起 Action 的 Application Command。 */
  readonly commandId: string;
  /** 关联完整调用链的稳定标识。 */
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
  /** 期望后置条件定义的内容摘要。 */
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

/** 一次副作用执行或恢复检查产生的不可变 Observation。 */
export interface ActionObservationRecord {
  /** Action Journal Schema 版本。 */
  readonly schemaVersion: typeof ACTION_JOURNAL_SCHEMA_VERSION;
  /** Record 类别固定为 Action Observation。 */
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
  /** 支撑结果判定的 Evidence ID。 */
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

/** 对最新 Observation 作出的不可变处置记录。 */
export interface ActionResolutionRecord {
  /** Action Journal Schema 版本。 */
  readonly schemaVersion: typeof ACTION_JOURNAL_SCHEMA_VERSION;
  /** Record 类别固定为 Action Resolution。 */
  readonly recordType: ActionJournalRecordType.Resolution;
  /** Resolution 所属 Action。 */
  readonly actionId: ActionId;
  /** Action 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Action 所属 Task。 */
  readonly taskId: TaskId;
  /** Action Journal 内严格递增的记录序号。 */
  readonly sequence: number;
  /** 对最新 Observation 作出的封闭处置。 */
  readonly resolution: ActionResolution;
  /** 可审计的处置原因。 */
  readonly reason: string;
  /** 记录处置的 Actor。 */
  readonly actor: ActorRef;
  /** Resolution 记录时间。 */
  readonly recordedAt: string;
}

/** Action Journal 允许追加和重放的完整 Record 集合。 */
export type ActionJournalRecord =
  ActionIntentRecord | ActionObservationRecord | ActionResolutionRecord;

/** 一个 Action 的可恢复 Journal 状态。 */
export interface ActionJournalState {
  /** 不可变 Action Intent。 */
  readonly intent: ActionIntentRecord;
  /** 按序保存的全部 Observation。 */
  readonly observations: readonly ActionObservationRecord[];
  /** 按序保存的全部处置记录。 */
  readonly resolutions: readonly ActionResolutionRecord[];
  /** 当前严格递增的最后记录序号。 */
  readonly lastSequence: number;
  /** 根据记录确定性归约得到的当前状态。 */
  readonly status: ActionJournalStatus;
}
