import {
  AnalyzeRequirementUseCase,
  ConfirmRequirementUseCase,
  RequirementWorkflowCommandHandler,
  WorkflowCommandService,
  type ApplicationCommandGateway,
  type ProposeArtifactUseCase,
  type RecordApprovalUseCase,
} from "#application/index.js";
import type { ArtifactDigestPort, RequirementAnalysisAgent } from "#application/ports/index.js";
import type { Clock, IdGenerator } from "#common/index.js";
import { failure, HarnessError, HarnessErrorCode } from "#common/index.js";
import {
  FileWorkflowRepository,
  type ExclusiveFileLockManager,
  type FileParentDirectoryDurability,
} from "#infrastructure/index.js";

/** Requirement 应用组合所需的基础依赖。 */
interface RequirementApplicationFactoryInput {
  /** Runtime Store 根目录。 */
  storeRoot: string;
  /** 可选的真实需求分析 Agent。 */
  requirementAnalysisAgent: RequirementAnalysisAgent | undefined;
  /** 现有 Artifact Proposal 提交能力。 */
  proposeArtifact: ProposeArtifactUseCase;
  /** 现有 Human Approval 记录能力。 */
  recordApproval: RecordApprovalUseCase;
  /** Requirement 确认内部幂等绑定使用的摘要实现。 */
  digest: ArtifactDigestPort;
  /** 统一 Application Command Gateway。 */
  applicationCommandGateway: ApplicationCommandGateway;
  /** Workflow Store 共用的文件锁。 */
  lockManager: ExclusiveFileLockManager;
  /** Workflow Store 的父目录耐久化实现。 */
  parentDirectoryDurability: FileParentDirectoryDurability;
  /** 生成 Workflow Event 时间的时钟。 */
  clock: Clock;
  /** 生成 Workflow Event ID 的生成器。 */
  eventIdGenerator: IdGenerator;
}

/** Requirement 分析与 Workflow 命令的组合结果。 */
export interface RequirementApplication {
  /** 只读需求分析用例。 */
  analyzeRequirement: AnalyzeRequirementUseCase;
  /** Human Review 后的 Requirement 确认用例。 */
  confirmRequirement: ConfirmRequirementUseCase;
  /** Requirement Workflow 命令服务。 */
  workflowCommands: WorkflowCommandService;
}

/** 创建 Requirement 分析与 Workflow 命令应用。 */
export function createRequirementApplication(
  input: RequirementApplicationFactoryInput,
): RequirementApplication {
  const workflowRepository = new FileWorkflowRepository(input.storeRoot, {
    lockManager: input.lockManager,
    parentDirectoryDurability: input.parentDirectoryDurability,
  });
  const analysisAgent = input.requirementAnalysisAgent ?? createDisabledAnalysisAgent();

  return {
    analyzeRequirement: new AnalyzeRequirementUseCase(analysisAgent),
    confirmRequirement: new ConfirmRequirementUseCase(
      input.proposeArtifact,
      input.recordApproval,
      input.digest,
    ),
    workflowCommands: new WorkflowCommandService(
      input.applicationCommandGateway,
      new RequirementWorkflowCommandHandler(
        workflowRepository,
        input.clock,
        input.eventIdGenerator,
      ),
    ),
  };
}

function createDisabledAnalysisAgent(): RequirementAnalysisAgent {
  return {
    analyze: () =>
      Promise.resolve(
        failure(
          new HarnessError(
            HarnessErrorCode.OperationForbidden,
            "Requirement analysis agent is not configured.",
          ),
        ),
      ),
  };
}
