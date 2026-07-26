import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { ActionId } from "#domain/actionJournal/index.js";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type {
  ActionJournalRepository,
  CodingTaskSessionActivationRepository,
  CodingTaskSessionAdmissionStateStore,
  ContentDigestPort,
  TraceObservationStore,
} from "#application/ports/index.js";

import type { CODING_TASK_SESSION_ACTION_COVERAGE_MANIFEST_SCHEMA_VERSION } from "../constants/index.js";

/** CodingTask Session Action/Trace Coverage Proof 的唯一定位输入。 */
export interface CodingTaskSessionActionCoverageInput {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 外部 Agent Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
}

/** Coverage Proof 中单个 Action 的最小摘要。 */
export interface CodingTaskSessionActionCoverageManifestAction {
  /** Admission 权威提供的 Action 标识。 */
  readonly actionId: ActionId;
  /** 完整 ActionJournalState 的 RFC 8785 摘要。 */
  readonly journalDigest: ContentDigest;
  /** 该 Action 全部 Trace Observation 的 RFC 8785 摘要，按摘要排序。 */
  readonly traceObservationDigests: readonly ContentDigest[];
}

/** 不包含 manifestDigest 的 canonical manifest 内容。 */
export interface CodingTaskSessionActionCoverageManifestDigestInput {
  /** Coverage Proof Schema 版本。 */
  readonly schemaVersion: typeof CODING_TASK_SESSION_ACTION_COVERAGE_MANIFEST_SCHEMA_VERSION;
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 外部 Agent Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** CodingTask 标识。 */
  readonly codingTaskId: CodingTaskId;
  /** Activation 使用的源 Task 标识。 */
  readonly sourceTaskId: TaskId;
  /** 目标 Repository 标识。 */
  readonly repositoryId: RepositoryId;
  /** 当前 Session Attempt 编号。 */
  readonly attemptNumber: number;
  /** Activation binding 摘要。 */
  readonly activationBindingDigest: ContentDigest;
  /** Session binding 摘要。 */
  readonly sessionBindingDigest: ContentDigest;
  /** 受管 Worktree 标识。 */
  readonly worktreeId: string;
  /** Worktree root 摘要。 */
  readonly worktreeRootDigest: ContentDigest;
  /** Executor Session 摘要。 */
  readonly executorSessionIdDigest: ContentDigest;
  /** 按 Action ID 排序的摘要条目。 */
  readonly actions: readonly CodingTaskSessionActionCoverageManifestAction[];
}

/** 仅保存摘要的 CodingTask Session Action/Trace Coverage Proof。 */
export interface CodingTaskSessionActionCoverageManifest extends CodingTaskSessionActionCoverageManifestDigestInput {
  /** 整个 canonical manifest 的 RFC 8785 摘要。 */
  readonly manifestDigest: ContentDigest;
}

/** Coverage Proof Application Service 所需的既有 Port 集合。 */
export interface CodingTaskSessionActionCoverageServiceDependencies {
  /** 读取不可变 Activation Record。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** 读取 Session Admission State。 */
  readonly admissionStateStore: CodingTaskSessionAdmissionStateStore;
  /** 重放单个 Action Journal。 */
  readonly actionJournalRepository: ActionJournalRepository;
  /** 查询持久化 Trace Observation。 */
  readonly traceObservationStore: TraceObservationStore;
  /** 计算 RFC 8785 Content Digest。 */
  readonly contentDigest: ContentDigestPort;
}

/** Coverage Proof Service 的标准结果类型。 */
export type CodingTaskSessionActionCoverageResult = Result<
  CodingTaskSessionActionCoverageManifest,
  HarnessError
>;
