import {
  AnalyzePlanRiskUseCase,
  ConfirmPlanRiskUseCase,
  type ProposeArtifactUseCase,
  type RecordApprovalUseCase,
} from "#application/index.js";
import type {
  ArtifactDigestPort,
  PlanRiskAnalysisAgent,
  RepositoryRootResolverPort,
  TaskRepository,
} from "#application/ports/index.js";
import { failure, HarnessError, HarnessErrorCode } from "#common/index.js";

/** PlanRisk 应用组合所需依赖。 */
interface PlanRiskApplicationFactoryInput {
  /** Task Event Replay 仓储。 */
  taskRepository: TaskRepository;
  /** 可选的只读 PlanRisk 分析 Agent。 */
  planRiskAnalysisAgent: PlanRiskAnalysisAgent | undefined;
  /** 解析启动期可信 Repository Root 的边界。 */
  repositoryRootResolver: RepositoryRootResolverPort;
  /** 现有 Artifact Proposal 提交能力。 */
  proposeArtifact: ProposeArtifactUseCase;
  /** 现有 Human Approval 记录能力。 */
  recordApproval: RecordApprovalUseCase;
  /** Human 确认内部幂等绑定使用的摘要实现。 */
  digest: ArtifactDigestPort;
}

/** PlanRisk 分析与 Human 确认应用。 */
export interface PlanRiskApplication {
  /** 基于已批准 Requirement 的只读规划。 */
  analyzePlanRisk: AnalyzePlanRiskUseCase;
  /** Human Review 后的 Business Logic/PlanRisk 确认。 */
  confirmPlanRisk: ConfirmPlanRiskUseCase;
}

/** 创建 PlanRisk 分析与确认应用。 */
export function createPlanRiskApplication(
  input: PlanRiskApplicationFactoryInput,
): PlanRiskApplication {
  return {
    analyzePlanRisk: new AnalyzePlanRiskUseCase(
      input.taskRepository,
      input.repositoryRootResolver,
      input.planRiskAnalysisAgent ?? createDisabledAnalysisAgent(),
    ),
    confirmPlanRisk: new ConfirmPlanRiskUseCase(
      input.taskRepository,
      input.proposeArtifact,
      input.recordApproval,
      input.digest,
    ),
  };
}

function createDisabledAnalysisAgent(): PlanRiskAnalysisAgent {
  return {
    analyze: () =>
      Promise.resolve(
        failure(
          new HarnessError(
            HarnessErrorCode.OperationForbidden,
            "PlanRisk analysis agent is not configured.",
          ),
        ),
      ),
  };
}
