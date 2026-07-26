import type {
  ActorRef,
  ContentDigest,
  HarnessError,
  HarnessErrorCode,
  Result,
} from "#common/index.js";
import type { ActionId } from "#domain/actionJournal/index.js";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { CodingTaskSessionChangeSetSnapshot } from "#domain/codingTaskSessionChangeSet/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { ChangeSetCheckpoint } from "#application/changeSetCheckpoint/index.js";

import type {
  CODING_TASK_SESSION_CLOSEOUT_ACTION_EVIDENCE_SCHEMA_VERSION,
  CODING_TASK_SESSION_CLOSEOUT_STATE_SCHEMA_VERSION,
} from "../constants/index.js";
import type {
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionCloseoutStatus,
} from "../enums/index.js";

/** Closeout State 中不会随阶段变化的身份字段。 */
export interface CodingTaskSessionCloseoutStateIdentity {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** CodingTask 标识。 */
  readonly codingTaskId: CodingTaskId;
  /** 来源 Task 标识。 */
  readonly sourceTaskId: TaskId;
  /** Repository 稳定标识。 */
  readonly repositoryId: RepositoryId;
  /** 当前 Attempt 序号。 */
  readonly attemptNumber: number;
  /** Activation 绑定摘要。 */
  readonly activationBindingDigest: ContentDigest;
  /** Session 绑定摘要。 */
  readonly sessionBindingDigest: ContentDigest;
  /** 请求内容摘要。 */
  readonly requestDigest: ContentDigest;
  /** 命令幂等键。 */
  readonly idempotencyKey: string;
  /** 命令标识。 */
  readonly commandId: string;
  /** 因果链关联标识。 */
  readonly correlationId: string;
  /** 可选的上游因果标识。 */
  readonly causationId?: string;
  /** 发起或确认 Closeout 的 Actor。 */
  readonly actor: ActorRef;
  /** State 首次创建时间。 */
  readonly createdAt: string;
}

/** Closeout Process State 的完整持久化结构。 */
export interface CodingTaskSessionCloseoutState extends CodingTaskSessionCloseoutStateIdentity {
  /** Closeout State Schema 版本。 */
  readonly schemaVersion: typeof CODING_TASK_SESSION_CLOSEOUT_STATE_SCHEMA_VERSION;
  /** 当前 Closeout 阶段。 */
  readonly status: CodingTaskSessionCloseoutStatus;
  /** 已验证的完整提交前 Snapshot。 */
  readonly snapshot: CodingTaskSessionChangeSetSnapshot | null;
  /** 已覆盖且规范排序的 Action ID。 */
  readonly coveredActionIds: readonly ActionId[];
  /** 绑定 Snapshot 的 Action Evidence 摘要。 */
  readonly actionEvidenceDigest: ContentDigest | null;
  /** 已验证且与 Snapshot 双向绑定的 Checkpoint。 */
  readonly checkpoint: ChangeSetCheckpoint | null;
  /** 发生阻断或未知结果的阶段。 */
  readonly stoppedStage: CodingTaskSessionCloseoutStage | null;
  /** 阻断或未知结果的稳定错误码。 */
  readonly errorCode: HarnessErrorCode | null;
  /** 面向恢复流程的指导。 */
  readonly recoveryGuidance: string | null;
  /** 乐观并发版本。 */
  readonly version: number;
  /** 最近一次状态变化时间。 */
  readonly updatedAt: string;
}

/** 创建 Closing 状态所需的固定身份输入。 */
export type CodingTaskSessionCloseoutStateInput = CodingTaskSessionCloseoutStateIdentity;

/** 需要更新时间的 Closeout 状态转换输入。 */
export interface CodingTaskSessionCloseoutStateTimestampInput {
  /** 转换完成时间。 */
  readonly updatedAt: string;
}

/** 持久化 Snapshot 与 Action Evidence 的转换输入。 */
export interface CodingTaskSessionCloseoutPersistSnapshotInput extends CodingTaskSessionCloseoutStateTimestampInput {
  /** 完整且已验证的提交前 Snapshot。 */
  readonly snapshot: CodingTaskSessionChangeSetSnapshot;
  /** 本次 Closeout 覆盖的 Action ID 集合。 */
  readonly coveredActionIds: readonly ActionId[];
  /** 绑定 Snapshot 摘要的 Action Evidence 摘要。 */
  readonly actionEvidenceDigest: ContentDigest;
}

/** 绑定 ChangeSet Checkpoint 的转换输入。 */
export interface CodingTaskSessionCloseoutBindCheckpointInput extends CodingTaskSessionCloseoutStateTimestampInput {
  /** 已与 Snapshot 双向绑定的 Checkpoint。 */
  readonly checkpoint: ChangeSetCheckpoint;
}

/** 进入 Blocked 或 OutcomeUnknown 的转换输入。 */
export interface CodingTaskSessionCloseoutTerminalInput extends CodingTaskSessionCloseoutStateTimestampInput {
  /** 稳定错误码。 */
  readonly errorCode: HarnessErrorCode;
  /** 人工或恢复流程的下一步指导。 */
  readonly recoveryGuidance: string;
}

/** Action Evidence 摘要计算所使用的规范输入。 */
export interface CodingTaskSessionCloseoutActionEvidenceDigestInput {
  /** Action Evidence Digest Schema 版本。 */
  readonly schemaVersion: typeof CODING_TASK_SESSION_CLOSEOUT_ACTION_EVIDENCE_SCHEMA_VERSION;
  /** 完整 Snapshot 摘要。 */
  readonly snapshotDigest: ContentDigest;
  /** 规范排序后的 Action ID。 */
  readonly coveredActionIds: readonly ActionId[];
}

/** Closeout 状态转换的统一返回类型。 */
export type CodingTaskSessionCloseoutStateResult = Result<
  CodingTaskSessionCloseoutState,
  HarnessError
>;
