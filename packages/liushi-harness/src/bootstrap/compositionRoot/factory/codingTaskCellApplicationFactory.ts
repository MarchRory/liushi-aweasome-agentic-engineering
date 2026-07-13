import {
  CodingTaskCellService,
  CodingTaskCommandService,
  ImplementationCommandService,
  ImplementationSubmissionService,
  VerificationCommandService,
  type ApplicationCommandGateway,
  type CodingTaskCommandHandler,
  type ImplementationCommandHandler,
  type ImplementationSubmissionHandler,
  type VerificationCommandHandler,
  type WorktreeProvisionCommandService,
} from "#application/index.js";
import type { EvidenceBundleStore } from "#application/ports/index.js";

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
  return {
    codingTaskCommands,
    implementationCommands,
    implementationSubmissions,
    verificationCommands,
    runCodingTaskCell: new CodingTaskCellService(
      codingTaskCommands,
      input.worktreeProvisionCommands,
      implementationCommands,
      implementationSubmissions,
      verificationCommands,
      input.evidenceBundleStore,
    ),
  };
}
