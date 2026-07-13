import type { ContentDigest } from "#common/index.js";
import type { PlanRiskItem, RiskOperation } from "#domain/artifact/index.js";
import type { CodingTaskExecutionAuthorization, CodingTaskId } from "#domain/codingTask/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { VerificationStatus } from "#domain/verification/index.js";
import type { InputBindingSet } from "#domain/workflow/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { DependencyAssessmentStatus, RepositoryDeliveryArtifactType } from "../enums/index.js";

/** PR-ready Repository Delivery Artifact 的稳定 Schema 版本。 */
export const PR_READY_ARTIFACT_SCHEMA_VERSION = "1.0.0";

/** 由 Artifact Digest 确定性派生的 PR-ready Artifact 标识。 */
export type PrReadyArtifactId = `pr-ready:${string}`;

/** PR-ready Artifact 对已通过 Verification 的强一致绑定。 */
export interface PrReadyVerificationBinding {
  /** Verification Run 的稳定标识。 */
  readonly verificationRunId: string;
  /** Verification Plan 的稳定标识。 */
  readonly planId: string;
  /** 完整 Verification Plan 的内容摘要。 */
  readonly planDigest: ContentDigest;
  /** 完整 EvidenceBundle 的内容摘要。 */
  readonly evidenceBundleDigest: ContentDigest;
  /** 仅允许已通过的 Verification 状态。 */
  readonly status: VerificationStatus.Passed;
}

/** 尚未评估的依赖变化占位，禁止暗示依赖安全。 */
export interface UnassessedDependencyAssessment {
  /** 当前依赖评估的封闭状态。 */
  readonly status: DependencyAssessmentStatus.NotAssessed;
  /** 未评估时必须保持为空的依赖变化集合。 */
  readonly changes: readonly [];
}

/** 参与 Artifact Digest 计算且不包含循环身份字段的完整正文。 */
export interface PrReadyArtifactBody {
  /** PR-ready Artifact 的稳定 Schema 版本。 */
  readonly schemaVersion: typeof PR_READY_ARTIFACT_SCHEMA_VERSION;
  /** Repository Delivery Artifact 的封闭类型。 */
  readonly artifactType: RepositoryDeliveryArtifactType.PrReady;
  /** CodingTask 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask 所属 Repository。 */
  readonly repositoryId: RepositoryId;
  /** 已完成 CodingTask 的稳定标识。 */
  readonly codingTaskId: CodingTaskId;
  /** 提供授权 Artifact 的来源 Task。 */
  readonly sourceTaskId: TaskId;
  /** 实现开始时锁定的基础 Revision。 */
  readonly baseRevision: string;
  /** 已通过验证的最新实现 Revision。 */
  readonly headRevision: string;
  /** CodingTask 绑定的 Worktree 标识。 */
  readonly worktreeId: string;
  /** CodingTask 绑定的 Branch 名称。 */
  readonly branchName: string;
  /** CodingTask 权威 Write Set，保持原始顺序。 */
  readonly writeSet: readonly string[];
  /** 最新 Attempt 的权威 Changed Paths，保持原始顺序。 */
  readonly changedPaths: readonly string[];
  /** Base、Head 与 Changed Paths 的确定性摘要。 */
  readonly diffDigest: ContentDigest;
  /** CodingTask 创建时锁定的输入绑定集合。 */
  readonly inputBindingSet: InputBindingSet;
  /** 已通过 Verification 与 EvidenceBundle 的摘要绑定。 */
  readonly verification: PrReadyVerificationBinding;
  /** CodingTask 创建时锁定的精确 Human Gate 授权。 */
  readonly authorization: CodingTaskExecutionAuthorization;
  /** PlanRisk 声明的全部剩余风险，不声明任何风险已消除。 */
  readonly remainingRisks: readonly PlanRiskItem[];
  /** PlanRisk 声明的全部风险操作。 */
  readonly riskOperations: readonly RiskOperation[];
  /** PlanRisk 声明的完整回滚方案。 */
  readonly rollbackPlan: readonly string[];
  /** 尚未执行的依赖影响评估。 */
  readonly dependencyAssessment: UnassessedDependencyAssessment;
  /** CodingTask 达到完成状态的权威时间。 */
  readonly assembledAt: string;
}

/** 可进入人工 Review 的确定性 Repository Delivery Artifact。 */
export interface PrReadyArtifact extends PrReadyArtifactBody {
  /** 从 Artifact Digest 十六进制正文确定性派生的标识。 */
  readonly artifactId: PrReadyArtifactId;
  /** 对不含 Artifact ID 与自身摘要的完整正文计算的摘要。 */
  readonly artifactDigest: ContentDigest;
}
