import type { ChangeSetCheckpointRecoveryStatus } from "#application/changeSetCheckpoint/index.js";
import type {
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionCloseoutStatus,
} from "#application/codingTaskSessionCloseoutState/index.js";
import type { ContentDigest, HarnessError, HarnessErrorCode, Result } from "#common/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { CODING_TASK_SESSION_CLOSEOUT_RECOVERY_ASSESSMENT_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CodingTaskSessionCloseoutRecoveryDiagnostic,
  CodingTaskSessionCloseoutRecoveryDisposition,
  CodingTaskSessionCloseoutRecoveryResolution,
} from "../enums/index.js";
import type { CODING_TASK_SESSION_CLOSEOUT_STATE_SCHEMA_VERSION } from "#application/codingTaskSessionCloseoutState/constants/index.js";

/** 公开 Assessment Use Case 的严格输入。 */
export interface AssessCodingTaskSessionCloseoutRecoveryInput {
  /** Harness Workspace 标识。 */
  readonly workspaceId: string;
  /** 外部 CodingTask Session 标识。 */
  readonly sessionId: string;
}

/** 不包含自身 Digest 与证据标识的规范 Assessment 正文。 */
export interface CodingTaskSessionCloseoutRecoveryAssessmentBody {
  /** Assessment 契约版本。 */
  readonly schemaVersion: typeof CODING_TASK_SESSION_CLOSEOUT_RECOVERY_ASSESSMENT_SCHEMA_VERSION;
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** CodingTask 标识。 */
  readonly codingTaskId: CodingTaskId;
  /** 来源 Task 标识。 */
  readonly sourceTaskId: TaskId;
  /** Repository 标识。 */
  readonly repositoryId: RepositoryId;
  /** 当前 Attempt 序号。 */
  readonly attemptNumber: number;
  /** 受管 Worktree 标识。 */
  readonly worktreeId: string;
  /** 受管 Worktree 分支名称。 */
  readonly branchName: string;
  /** 可信 Repository Root 的 Digest。 */
  readonly repositoryRootDigest: ContentDigest;
  /** 可信 Managed Worktree Root 的 Digest。 */
  readonly worktreeRootDigest: ContentDigest;
  /** Attempt 锁定的基础 Revision。 */
  readonly baseRevision: string;
  /** Human 已批准的规范 Write Set。 */
  readonly writeSet: readonly string[];
  /** 原 Closeout State 的 Schema 版本。 */
  readonly closeoutSchemaVersion: typeof CODING_TASK_SESSION_CLOSEOUT_STATE_SCHEMA_VERSION;
  /** 原 Closeout State 的乐观并发版本。 */
  readonly closeoutVersion: number;
  /** 原 Closeout State 当前状态。 */
  readonly closeoutStatus: CodingTaskSessionCloseoutStatus;
  /** 原 Closeout State 停止阶段。 */
  readonly closeoutStoppedStage: CodingTaskSessionCloseoutStage | null;
  /** 原 Closeout State 稳定错误码。 */
  readonly closeoutErrorCode: HarnessErrorCode | null;
  /** 原 Closeout State 完整规范 Digest。 */
  readonly closeoutStateDigest: ContentDigest;
  /** 持久化 Snapshot Digest。 */
  readonly snapshotDigest: ContentDigest | null;
  /** 持久化 Snapshot 与 Coverage 的绑定 Digest。 */
  readonly coverageBindingDigest: ContentDigest | null;
  /** Checkpoint Recovery 的封闭三态。 */
  readonly checkpointStatus: ChangeSetCheckpointRecoveryStatus;
  /** 已复验 Checkpoint 的绑定 Digest；无 Present 证据时为 null。 */
  readonly checkpointBindingDigest: ContentDigest | null;
  /** 当前 Assessment 的封闭处置。 */
  readonly disposition: CodingTaskSessionCloseoutRecoveryDisposition;
  /** 当前唯一允许的 Resolution；HumanRequired 时为 null。 */
  readonly allowedResolution: CodingTaskSessionCloseoutRecoveryResolution | null;
  /** 面向调用方的稳定诊断。 */
  readonly diagnostic: CodingTaskSessionCloseoutRecoveryDiagnostic;
}

/** 面向调用方的 Closeout Recovery Assessment。 */
export interface CodingTaskSessionCloseoutRecoveryAssessment extends CodingTaskSessionCloseoutRecoveryAssessmentBody {
  /** 仅由规范 Assessment 正文计算的 Digest。 */
  readonly assessmentDigest: ContentDigest;
  /** 由 Assessment Digest 派生且不参与正文 Digest 的证据标识。 */
  readonly evidenceIds: readonly string[];
}

/** Assessment Use Case 的稳定返回类型。 */
export type CodingTaskSessionCloseoutRecoveryAssessmentResult = Result<
  CodingTaskSessionCloseoutRecoveryAssessment,
  HarnessError
>;
