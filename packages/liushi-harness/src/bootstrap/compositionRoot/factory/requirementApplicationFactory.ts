import {
  AnalyzeRequirementUseCase,
  RequirementWorkflowCommandHandler,
  WorkflowCommandService,
  type ApplicationCommandGateway,
} from "#application/index.js";
import type { RequirementAnalysisAgent } from "#application/ports/index.js";
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
