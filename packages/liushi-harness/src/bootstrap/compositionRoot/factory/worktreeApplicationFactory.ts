import {
  AssessWorktreeProvisionRecoveryUseCase,
  WorktreeProvisionCommandHandler,
  WorktreeProvisionCommandService,
  WorktreeProvisionRecoveryAssessmentService,
  WorktreeProvisionRecoveryCommandHandler,
  WorktreeProvisionRecoveryCommandService,
  type ApplicationCommandGateway,
  type JournaledActionRunner,
} from "#application/index.js";
import type {
  ActionExecutionLockPort,
  ActionJournalRepository,
  CodingTaskExecutionAuthorizationResolver,
  CodingTaskRepository,
  ContentDigestPort,
  RepositoryLockPort,
  RepositoryRootResolverPort,
  WorktreeInspectorPort,
} from "#application/ports/index.js";
import type { Clock } from "#common/index.js";
import {
  NodeWorktreeProvisionerAdapter,
  NodeWorktreeProvisionRecoveryInspectorAdapter,
  type CommandRunner,
} from "#infrastructure/index.js";

/** Worktree 应用子系统装配所需的共享依赖。 */
export interface WorktreeApplicationFactoryInput {
  /** 持久化 Application Command Gateway。 */
  readonly applicationCommandGateway: ApplicationCommandGateway;
  /** CodingTask 权威 Repository。 */
  readonly codingTaskRepository: CodingTaskRepository;
  /** CodingTask 权威授权解析器。 */
  readonly codingTaskAuthorizationResolver: CodingTaskExecutionAuthorizationResolver;
  /** Action Journal 持久化仓储。 */
  readonly actionJournalRepository: ActionJournalRepository;
  /** 启动期可信 Repository Root 解析器。 */
  readonly repositoryRootResolver: RepositoryRootResolverPort;
  /** Repository 级排他锁。 */
  readonly repositoryLock: RepositoryLockPort;
  /** Action 级跨进程执行锁。 */
  readonly actionExecutionLock: ActionExecutionLockPort;
  /** Intent-first 副作用执行内核。 */
  readonly journaledActionRunner: JournaledActionRunner;
  /** 使用参数数组且关闭 Shell 的命令执行器。 */
  readonly commandRunner: CommandRunner;
  /** 既有 Worktree 只读检查器。 */
  readonly worktreeInspector: WorktreeInspectorPort;
  /** 规范内容摘要端口。 */
  readonly digest: ContentDigestPort;
  /** 可注入时钟。 */
  readonly clock: Clock;
}

/** Worktree 应用子系统对 Composition Root 返回的公开入口。 */
export interface WorktreeApplicationFactoryOutput {
  /** 创建并验证 Managed Worktree 的版本化命令入口。 */
  readonly worktreeProvisionCommands: WorktreeProvisionCommandService;
  /** 只读评估未知 Worktree Provision Action 的真实现场。 */
  readonly assessWorktreeProvisionRecovery: AssessWorktreeProvisionRecoveryUseCase;
  /** 由 Human 绑定评估摘要后闭合未知 Worktree Provision Action。 */
  readonly worktreeProvisionRecoveryCommands: WorktreeProvisionRecoveryCommandService;
}

/** 在 Bootstrap 层集中装配 Worktree Provision 与恢复能力。 */
export function createWorktreeApplication(
  input: WorktreeApplicationFactoryInput,
): WorktreeApplicationFactoryOutput {
  const provisioner = new NodeWorktreeProvisionerAdapter(
    input.commandRunner,
    input.worktreeInspector,
    input.digest,
  );
  const recoveryInspector = new NodeWorktreeProvisionRecoveryInspectorAdapter(
    input.commandRunner,
    input.worktreeInspector,
  );
  const recoveryAssessment = new WorktreeProvisionRecoveryAssessmentService(
    input.codingTaskRepository,
    input.actionJournalRepository,
    input.repositoryRootResolver,
    recoveryInspector,
    input.digest,
  );
  const recoveryHandler = new WorktreeProvisionRecoveryCommandHandler(
    input.codingTaskRepository,
    input.actionJournalRepository,
    input.repositoryLock,
    input.actionExecutionLock,
    recoveryAssessment,
    input.digest,
    input.clock,
  );
  return {
    worktreeProvisionCommands: new WorktreeProvisionCommandService(
      input.applicationCommandGateway,
      new WorktreeProvisionCommandHandler(
        input.codingTaskRepository,
        input.codingTaskAuthorizationResolver,
        input.repositoryLock,
        input.journaledActionRunner,
        provisioner,
        input.digest,
      ),
    ),
    assessWorktreeProvisionRecovery: new AssessWorktreeProvisionRecoveryUseCase(recoveryAssessment),
    worktreeProvisionRecoveryCommands: new WorktreeProvisionRecoveryCommandService(
      input.applicationCommandGateway,
      recoveryHandler,
    ),
  };
}
