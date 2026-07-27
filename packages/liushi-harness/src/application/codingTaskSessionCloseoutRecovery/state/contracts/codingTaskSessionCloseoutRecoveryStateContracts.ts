import type { ChangeSetCheckpoint } from "#application/changeSetCheckpoint/index.js";
import type { CodingTaskSessionCloseoutRecoveryResolution } from "#application/codingTaskSessionCloseoutRecovery/enums/index.js";
import type {
  ActorRef,
  ContentDigest,
  HarnessError,
  HarnessErrorCode,
  Result,
} from "#common/index.js";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_SCHEMA_VERSION } from "../constants/index.js";
import type { CodingTaskSessionCloseoutRecoveryStateStatus } from "../enums/index.js";

/** Recovery State 中不随状态迁移改变的审计身份。 */
export interface CodingTaskSessionCloseoutRecoveryStateIdentity {
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
  /** 原 Closeout State 对应的执行 Attempt。 */
  readonly attemptNumber: number;
  /** 原 Closeout State 的完整规范化摘要。 */
  readonly closeoutStateDigest: ContentDigest;
  /** 原 Closeout State 的乐观并发版本。 */
  readonly closeoutVersion: number;
  /** 只读 Recovery Assessment 的规范化摘要。 */
  readonly assessmentDigest: ContentDigest;
  /** 原 Closeout 中已持久化的提交前 Snapshot 摘要。 */
  readonly preSubmitSnapshotDigest: ContentDigest;
  /** 原 Closeout 中已持久化的 ChangeSet 摘要。 */
  readonly changeSetDigest: ContentDigest;
  /** BindExisting Assessment 已复验的 Checkpoint Binding；RetryOnce 时为空。 */
  readonly assessmentCheckpointBindingDigest: ContentDigest | null;
  /** 已经由严格 Human Command parser 复验的规范请求摘要。 */
  readonly requestDigest: ContentDigest;
  /** Human 请求的恢复决策。 */
  readonly requestedResolution: CodingTaskSessionCloseoutRecoveryResolution;
  /** 批准并创建该 Recovery Record 的 Human Actor。 */
  readonly actor: ActorRef;
  /** Human Recovery Command 标识。 */
  readonly commandId: string;
  /** Human Recovery Command 幂等键。 */
  readonly idempotencyKey: string;
  /** Recovery Command 的因果链标识。 */
  readonly correlationId: string;
  /** 可选的上游因果标识。 */
  readonly causationId?: string;
  /** Recovery Record 首次创建时间。 */
  readonly createdAt: string;
}

/** 完整的 Closeout Recovery Process State。 */
export interface CodingTaskSessionCloseoutRecoveryState extends CodingTaskSessionCloseoutRecoveryStateIdentity {
  /** Recovery State Schema 版本。 */
  readonly schemaVersion: typeof CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_SCHEMA_VERSION;
  /** 当前 Recovery Process 状态。 */
  readonly status: CodingTaskSessionCloseoutRecoveryStateStatus;
  /** 仅 CheckpointBound 状态允许保存的完整 Checkpoint。 */
  readonly checkpoint: ChangeSetCheckpoint | null;
  /** Retry 或人工介入的稳定错误类别。 */
  readonly errorCode: HarnessErrorCode | null;
  /** 面向后续 Human Gate 的稳定处理指引。 */
  readonly recoveryGuidance: string | null;
  /** Recovery State 的乐观并发版本。 */
  readonly version: number;
  /** 最近一次状态迁移时间。 */
  readonly updatedAt: string;
}

/** 创建 Approved Recovery State 的输入契约。 */
export interface CreateCodingTaskSessionCloseoutRecoveryStateInput {
  /** Workspace 的外部字符串标识。 */
  readonly workspaceId: string;
  /** Session 的外部字符串标识。 */
  readonly sessionId: string;
  /** CodingTask 的外部字符串标识。 */
  readonly codingTaskId: string;
  /** 来源 Task 的外部字符串标识。 */
  readonly sourceTaskId: string;
  /** Repository 的外部字符串标识。 */
  readonly repositoryId: string;
  /** 原 Closeout State 对应的执行 Attempt。 */
  readonly attemptNumber: number;
  /** 原 Closeout State 的外部摘要。 */
  readonly closeoutStateDigest: string;
  /** 原 Closeout State 的乐观并发版本。 */
  readonly closeoutVersion: number;
  /** Assessment 的外部摘要。 */
  readonly assessmentDigest: string;
  /** 原 Closeout 中已持久化的提交前 Snapshot 摘要。 */
  readonly preSubmitSnapshotDigest: string;
  /** 原 Closeout 中已持久化的 ChangeSet 摘要。 */
  readonly changeSetDigest: string;
  /** BindExisting Assessment 已复验的 Checkpoint Binding；RetryOnce 时为空。 */
  readonly assessmentCheckpointBindingDigest: string | null;
  /** 已经由严格 Human Command parser 复验的 canonical requestDigest。 */
  readonly requestDigest: string;
  /** Human 请求的恢复决策。 */
  readonly requestedResolution: CodingTaskSessionCloseoutRecoveryResolution;
  /** 批准并创建该 Recovery Record 的 Human Actor。 */
  readonly actor: ActorRef;
  /** Human Recovery Command 标识。 */
  readonly commandId: string;
  /** Human Recovery Command 幂等键。 */
  readonly idempotencyKey: string;
  /** Recovery Command 的因果链标识。 */
  readonly correlationId: string;
  /** 可选的上游因果标识。 */
  readonly causationId?: string;
  /** Recovery Record 首次创建时间。 */
  readonly createdAt: string;
}

/** 只更新 Recovery State 时间的迁移输入。 */
export interface CodingTaskSessionCloseoutRecoveryStateTimestampInput {
  /** 迁移完成时间。 */
  readonly updatedAt: string;
}

/** 绑定已复验 Checkpoint 的迁移输入。 */
export interface CodingTaskSessionCloseoutRecoveryStateCheckpointInput extends CodingTaskSessionCloseoutRecoveryStateTimestampInput {
  /** 必须由 Checkpoint Port 完整复验的 Checkpoint。 */
  readonly checkpoint: ChangeSetCheckpoint;
}

/** 进入需要人工处理状态的迁移输入。 */
export interface CodingTaskSessionCloseoutRecoveryStateTerminalInput extends CodingTaskSessionCloseoutRecoveryStateTimestampInput {
  /** 稳定的失败或未知结果错误类别。 */
  readonly errorCode: HarnessErrorCode;
  /** Human Gate 后续处理指引。 */
  readonly recoveryGuidance: string;
}

/** Recovery State 迁移的统一返回类型。 */
export type CodingTaskSessionCloseoutRecoveryStateResult = Result<
  CodingTaskSessionCloseoutRecoveryState,
  HarnessError
>;
