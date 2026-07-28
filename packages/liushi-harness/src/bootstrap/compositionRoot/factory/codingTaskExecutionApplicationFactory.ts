import {
  CodingTaskCommandHandler,
  ImplementationCommandHandler,
  ImplementationSubmissionHandler,
  VerificationActionExecutor,
  VerificationCommandHandler,
  type ApplicationCommandGateway,
  type CodingTaskSessionEffectiveCloseoutResolverPort,
  type JournaledActionRunner,
  type RunAndPersistVerificationUseCase,
  type UnresolvedWorktreeProvisionGuard,
} from "#application/index.js";
import type {
  CodingTaskExecutionAuthorizationResolver,
  CodingTaskRepository,
  ContentDigestPort,
  EvidenceBundleStore,
  RepositoryLockPort,
  RepositoryRootResolverPort,
  WorktreeInspectorPort,
} from "#application/ports/index.js";
import type { Clock, IdGenerator } from "#common/index.js";
import {
  NodeFileMutationExecutorAdapter,
  type FileCodingTaskSessionActivationRepositoryDependencies,
} from "#infrastructure/index.js";

import type { ChangeSetCheckpointApplicationFactoryOutput } from "./changeSetCheckpointApplicationFactory.js";
import {
  createCodingTaskSessionDeliveryApplication,
  type CodingTaskSessionDeliveryApplicationFactoryOutput,
} from "./codingTaskSessionDeliveryApplicationFactory.js";

/** CodingTask 执行期 Application 的集中装配输入。 */
export interface CodingTaskExecutionApplicationFactoryInput {
  /** Runtime Store 根目录。 */
  readonly storeRoot: string;
  /** File Store 共享的摘要、锁与目录持久化依赖。 */
  readonly storeDependencies: FileCodingTaskSessionActivationRepositoryDependencies;
  /** 所有外部写入口共享的 Command Gateway。 */
  readonly applicationCommandGateway: ApplicationCommandGateway;
  /** 权威 CodingTask Repository。 */
  readonly codingTaskRepository: CodingTaskRepository;
  /** 从当前 Task 状态重算执行授权的 Resolver。 */
  readonly authorizationResolver: CodingTaskExecutionAuthorizationResolver;
  /** 受信 Repository Root Resolver。 */
  readonly repositoryRootResolver: RepositoryRootResolverPort;
  /** Repository 级排他锁。 */
  readonly repositoryLock: RepositoryLockPort;
  /** 可恢复副作用的 Action Runner。 */
  readonly journaledActionRunner: JournaledActionRunner;
  /** 受管 Worktree 检查端口。 */
  readonly worktreeInspector: WorktreeInspectorPort;
  /** Verification Evidence 的强一致 Store。 */
  readonly evidenceBundleStore: EvidenceBundleStore;
  /** 执行并持久化 Verification 的 Use Case。 */
  readonly runAndPersistVerification: RunAndPersistVerificationUseCase;
  /** Worktree Provision 未决副作用守卫。 */
  readonly unresolvedProvisionGuard: UnresolvedWorktreeProvisionGuard;
  /** ChangeSet 检查、Checkpoint 与恢复应用。 */
  readonly changeSetApplication: ChangeSetCheckpointApplicationFactoryOutput;
  /** 原 Closeout 或 Recovery 后的 Effective Resolver。 */
  readonly effectiveCloseoutResolver: CodingTaskSessionEffectiveCloseoutResolverPort;
  /** 统一 RFC 8785 Content Digest 端口。 */
  readonly digest: ContentDigestPort;
  /** Domain Event 时钟。 */
  readonly clock: Clock;
  /** Domain Event ID 生成器。 */
  readonly eventIdGenerator: IdGenerator;
}

/** CodingTask 执行期 Handler 与 Session Delivery 应用集合。 */
export interface CodingTaskExecutionApplicationFactoryOutput {
  /** 追加权威 CodingTask Event 的内部 Handler。 */
  readonly codingTaskCommandHandler: CodingTaskCommandHandler;
  /** 在授权与副作用边界内执行文件变更的 Handler。 */
  readonly implementationCommandHandler: ImplementationCommandHandler;
  /** 创建旧式 Implementation Git Checkpoint 的兼容 Handler。 */
  readonly implementationSubmissionHandler: ImplementationSubmissionHandler;
  /** 运行并接纳 Verification 的 Handler。 */
  readonly verificationCommandHandler: VerificationCommandHandler;
  /** 将 Session Effective Closeout 接入 CodingTask 的应用入口。 */
  readonly deliveryApplication: CodingTaskSessionDeliveryApplicationFactoryOutput;
}

/** 集中装配 CodingTask 编码、提交、验证与 Session Delivery Handler。 */
export function createCodingTaskExecutionApplication(
  input: CodingTaskExecutionApplicationFactoryInput,
): CodingTaskExecutionApplicationFactoryOutput {
  const codingTaskCommandHandler = new CodingTaskCommandHandler(
    input.codingTaskRepository,
    input.clock,
    input.eventIdGenerator,
    input.authorizationResolver,
  );
  const verificationCommandHandler = new VerificationCommandHandler(
    input.codingTaskRepository,
    input.authorizationResolver,
    input.repositoryLock,
    input.journaledActionRunner,
    new VerificationActionExecutor(input.runAndPersistVerification),
    input.evidenceBundleStore,
    codingTaskCommandHandler,
    input.digest,
    input.unresolvedProvisionGuard,
  );
  const implementationCommandHandler = new ImplementationCommandHandler(
    input.codingTaskRepository,
    input.authorizationResolver,
    input.repositoryLock,
    input.journaledActionRunner,
    new NodeFileMutationExecutorAdapter(input.worktreeInspector, input.digest),
    input.digest,
    input.unresolvedProvisionGuard,
  );
  const implementationSubmissionHandler = new ImplementationSubmissionHandler(
    input.codingTaskRepository,
    input.authorizationResolver,
    input.repositoryRootResolver,
    input.repositoryLock,
    input.journaledActionRunner,
    input.changeSetApplication.gitCheckpoint,
    codingTaskCommandHandler,
    input.digest,
    input.unresolvedProvisionGuard,
  );
  const deliveryApplication = createCodingTaskSessionDeliveryApplication({
    storeRoot: input.storeRoot,
    storeDependencies: input.storeDependencies,
    applicationCommandGateway: input.applicationCommandGateway,
    effectiveCloseoutResolver: input.effectiveCloseoutResolver,
    codingTaskRepository: input.codingTaskRepository,
    authorizationResolver: input.authorizationResolver,
    repositoryRootResolver: input.repositoryRootResolver,
    repositoryLock: input.repositoryLock,
    checkpointInspector: input.changeSetApplication.changeSetCheckpoints,
    codingTaskHandler: codingTaskCommandHandler,
    unresolvedProvisionGuard: input.unresolvedProvisionGuard,
    digest: input.digest,
  });
  return {
    codingTaskCommandHandler,
    implementationCommandHandler,
    implementationSubmissionHandler,
    verificationCommandHandler,
    deliveryApplication,
  };
}
