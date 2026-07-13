import type { CODING_TASK_AGGREGATE_SCHEMA_VERSION } from "#common/index.js";
import type { ArtifactDigest, ArtifactId } from "#domain/artifact/index.js";
import type { ApprovalId } from "#domain/approval/index.js";
import type { GateEvaluationResult, GateId } from "#domain/policy/index.js";
import type { InputBindingSet } from "#domain/workflow/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";
import type { TaskId } from "#domain/task/index.js";

import type {
  CodingTaskAttemptOutcome,
  CodingTaskPhase,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
} from "../enums/index.js";
import type { FailureTaxonomy } from "#domain/workflow/index.js";
import type { CodingTaskId } from "../identifiers/index.js";

/** CodingTask 的工作树绑定信息。 */
export interface WorktreeBinding {
  /** 工作树稳定标识。 */
  worktreeId: string;
  /** 相对于仓库根目录的规范 POSIX 路径。 */
  relativePath: string;
  /** 工作树分支名。 */
  branchName: string;
  /** 是否由 Harness 管理。 */
  managed: boolean;
}

/** 单次实现尝试的不可变记录。 */
export interface CodingTaskAttempt {
  /** 从 1 开始的 Attempt 序号。 */
  number: number;
  /** Attempt 开始时间。 */
  startedAt: string;
  /** Attempt 结束时间；缺失表示仍在执行。 */
  finishedAt?: string;
  /** Attempt 的实现结果；缺失表示仍在执行。 */
  outcome?: CodingTaskAttemptOutcome;
  /** 实现提交对应的目标 Revision。 */
  targetRevision?: string;
  /** 实现提交按原始顺序记录的变更路径。 */
  changedPaths?: readonly string[];
  /** 明确失败时的实现失败分类。 */
  failureTaxonomy?: FailureTaxonomy;
  /** 当前 Attempt 的验证结果。 */
  verificationOutcome?: CodingTaskVerificationOutcome;
  /** 验证失败时的分类。 */
  verificationFailureTaxonomy?: FailureTaxonomy;
}

/** 一个 Artifact Gate Evaluation 的不可变执行授权绑定。 */
export interface CodingTaskGateBinding {
  /** 被授权 Artifact 的稳定标识。 */
  artifactId: ArtifactId;
  /** 被授权 Artifact 的当前 Digest。 */
  artifactDigest: ArtifactDigest;
  /** Gate Evaluation 的封闭结果。 */
  result: GateEvaluationResult;
  /** 该 Artifact 当时要求的 Gate。 */
  requiredGates: readonly GateId[];
  /** 已满足当前 Artifact 和 Gate 的 Approval。 */
  satisfiedApprovalIds: readonly ApprovalId[];
}

/** CodingTask 创建时锁定的需求与风险执行授权。 */
export interface CodingTaskExecutionAuthorization {
  /** 已通过 Gate 的 PlanRisk 授权。 */
  planRisk: CodingTaskGateBinding;
  /** 是否涉及历史业务逻辑变更。 */
  historicalLogicChange: boolean;
  /** 历史业务逻辑变更对应的 G2 授权。 */
  businessLogic?: CodingTaskGateBinding;
}

/** CodingTask 创建事件载荷。 */
export interface CodingTaskCreatedPayload {
  /** RequirementWorkflow Task 的稳定标识，用于回溯授权。 */
  sourceTaskId: TaskId;
  /** 仓库标识。 */
  repositoryId: RepositoryId;
  /** 创建时锁定的基础 Revision。 */
  baseRevision: string;
  /** 工作树绑定。 */
  worktreeBinding: WorktreeBinding;
  /** 初始写入路径集合。 */
  writeSet: readonly string[];
  /** 创建时锁定的输入绑定集合。 */
  inputBindingSet: InputBindingSet;
  /** 创建前已通过 Gate 的执行授权。 */
  executionAuthorization: CodingTaskExecutionAuthorization;
}

/** 可由事件 Replay 得到的单仓 CodingTask Aggregate。 */
export interface CodingTaskAggregate {
  /** Aggregate Schema 版本。 */
  schemaVersion: typeof CODING_TASK_AGGREGATE_SCHEMA_VERSION;
  /** CodingTask 稳定标识。 */
  codingTaskId: CodingTaskId;
  /** 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 创建 CodingTask 时依赖的 RequirementWorkflow Task。 */
  sourceTaskId: TaskId;
  /** 所属 Repository。 */
  repositoryId: RepositoryId;
  /** 创建时锁定的基础 Revision。 */
  baseRevision: string;
  /** 创建时锁定的工作树绑定。 */
  worktreeBinding: WorktreeBinding;
  /** 规范化、非空且去重的写入路径集合。 */
  writeSet: readonly string[];
  /** 创建时锁定的输入绑定集合。 */
  inputBindingSet: InputBindingSet;
  /** 创建时锁定的需求与风险执行授权。 */
  executionAuthorization: CodingTaskExecutionAuthorization;
  /** 当前业务阶段。 */
  phase: CodingTaskPhase;
  /** 当前运行状态。 */
  runState: CodingTaskRunState;
  /** 已开始的 Attempt 历史。 */
  attempts: readonly CodingTaskAttempt[];
  /** 当前已应用事件数。 */
  version: number;
  /** 创建时间。 */
  createdAt: string;
  /** 最近更新时间。 */
  updatedAt: string;
}
