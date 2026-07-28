import {
  AssemblePrReadyArtifactUseCase,
  CodingTaskCellService,
  CodingTaskCellVerificationBindingService,
  CodingTaskCommandService,
  ImplementationCommandService,
  ImplementationSubmissionService,
  VerificationCommandService,
  type ApplicationCommandGateway,
  type CodingTaskCommandHandler,
  type CodingTaskCellRuntimeBinding,
  type CodingTaskCellRuntimePathPort,
  type ImplementationCommandHandler,
  type ImplementationSubmissionHandler,
  type VerificationCommandHandler,
  type WorktreeProvisionCommandService,
} from "#application/index.js";
import { CodingTaskVerificationCompletionService } from "#application/codingTaskVerificationCompletion/index.js";
import type {
  CodingTaskExecutionAuthorizationResolver,
  CodingTaskRepository,
  ContentDigestPort,
  EvidenceBundleStore,
  TaskRepository,
} from "#application/ports/index.js";

/** CodingTask Cell 及其公开命令服务的装配输入。 */
export interface CodingTaskCellApplicationFactoryInput {
  /** 持久化 Application Command Gateway。 */
  readonly applicationCommandGateway: ApplicationCommandGateway;
  /** CodingTask 命令 Handler。 */
  readonly codingTaskCommandHandler: CodingTaskCommandHandler;
  /** Worktree Provision 命令服务。 */
  readonly worktreeProvisionCommands: WorktreeProvisionCommandService;
  /** 文件实现命令 Handler。 */
  readonly implementationCommandHandler: ImplementationCommandHandler;
  /** 实现提交命令 Handler。 */
  readonly implementationSubmissionHandler: ImplementationSubmissionHandler;
  /** Verification 命令 Handler。 */
  readonly verificationCommandHandler: VerificationCommandHandler;
  /** 强一致 EvidenceBundle Store。 */
  readonly evidenceBundleStore: EvidenceBundleStore;
  /** CodingTask Aggregate 的权威 Repository。 */
  readonly codingTaskRepository: CodingTaskRepository;
  /** 来源 Task 与 Human Gate Artifact 的权威 Repository。 */
  readonly taskRepository: TaskRepository;
  /** 从当前 Task Approval 与 Write Set 重算 CodingTask 授权。 */
  readonly codingTaskAuthorizationResolver: CodingTaskExecutionAuthorizationResolver;
  /** 所有交付摘要复用的规范 Content Digest Port。 */
  readonly digest: ContentDigestPort;
  /** 可选启动期可信单仓运行时绑定。 */
  readonly runtimeBinding?: CodingTaskCellRuntimeBinding;
  /** 隔离宿主路径语义的 Cell Runtime Path 端口。 */
  readonly runtimePath: CodingTaskCellRuntimePathPort;
}

/** Composition Root 对外暴露的 CodingTask Cell 命令入口。 */
export interface CodingTaskCellApplicationFactoryOutput {
  /** CodingTask 命令服务。 */
  readonly codingTaskCommands: CodingTaskCommandService;
  /** 文件实现命令服务。 */
  readonly implementationCommands: ImplementationCommandService;
  /** 实现提交命令服务。 */
  readonly implementationSubmissions: ImplementationSubmissionService;
  /** Verification 命令服务。 */
  readonly verificationCommands: VerificationCommandService;
  /** 单一纵向 CodingTask Cell。 */
  readonly runCodingTaskCell: CodingTaskCellService;
  /** 从权威 Store 组装 PR-ready Repository Delivery Artifact。 */
  readonly assemblePrReadyArtifact: AssemblePrReadyArtifactUseCase;
  /** 供兼容 Cell 与权威 Delivery Completion 共用的 Verification 尾链。 */
  readonly verificationCompletion: CodingTaskVerificationCompletionService;
}

/** 在 Bootstrap 层复用同一组命令服务构造 CodingTask Cell。 */
export function createCodingTaskCellApplication(
  input: CodingTaskCellApplicationFactoryInput,
): CodingTaskCellApplicationFactoryOutput {
  const codingTaskCommands = new CodingTaskCommandService(
    input.applicationCommandGateway,
    input.codingTaskCommandHandler,
  );
  const implementationCommands = new ImplementationCommandService(
    input.applicationCommandGateway,
    input.implementationCommandHandler,
  );
  const implementationSubmissions = new ImplementationSubmissionService(
    input.applicationCommandGateway,
    input.implementationSubmissionHandler,
  );
  const verificationCommands = new VerificationCommandService(
    input.applicationCommandGateway,
    input.verificationCommandHandler,
  );
  const assemblePrReadyArtifact = new AssemblePrReadyArtifactUseCase(
    input.codingTaskRepository,
    input.taskRepository,
    input.codingTaskAuthorizationResolver,
    input.evidenceBundleStore,
    input.digest,
  );
  const verificationCompletion = new CodingTaskVerificationCompletionService(
    verificationCommands,
    input.evidenceBundleStore,
    assemblePrReadyArtifact,
    input.digest,
  );
  return {
    codingTaskCommands,
    implementationCommands,
    implementationSubmissions,
    verificationCommands,
    assemblePrReadyArtifact,
    verificationCompletion,
    runCodingTaskCell: new CodingTaskCellService(
      codingTaskCommands,
      input.worktreeProvisionCommands,
      implementationCommands,
      implementationSubmissions,
      new CodingTaskCellVerificationBindingService(input.codingTaskRepository, input.digest),
      verificationCompletion,
      input.digest,
      input.runtimePath,
      input.runtimeBinding,
    ),
  };
}
