import {
  CodingTaskSessionDeliverySubmissionHandler,
  CodingTaskSessionDeliverySubmissionService,
  type ApplicationCommandGateway,
  type ChangeSetCheckpointPort,
  type CodingTaskCommandHandler,
  type CodingTaskSessionEffectiveCloseoutResolverPort,
  type UnresolvedWorktreeProvisionGuard,
} from "#application/index.js";
import type {
  CodingTaskExecutionAuthorizationResolver,
  CodingTaskRepository,
  ContentDigestPort,
  RepositoryLockPort,
  RepositoryRootResolverPort,
} from "#application/ports/index.js";
import {
  FileCodingTaskSessionCloseoutStore,
  type FileCodingTaskSessionActivationRepositoryDependencies,
} from "#infrastructure/index.js";

/** Session Delivery Submission Application 的装配输入。 */
export interface CodingTaskSessionDeliveryApplicationFactoryInput {
  /** Runtime Store 根目录。 */
  readonly storeRoot: string;
  /** Closeout Store 复用的文件持久化依赖。 */
  readonly storeDependencies: FileCodingTaskSessionActivationRepositoryDependencies;
  /** 持久化 Application Command Gateway。 */
  readonly applicationCommandGateway: ApplicationCommandGateway;
  /** 原 Closeout 或 Recovery 后的 Effective Resolver。 */
  readonly effectiveCloseoutResolver: CodingTaskSessionEffectiveCloseoutResolverPort;
  /** 权威 CodingTask Aggregate Repository。 */
  readonly codingTaskRepository: CodingTaskRepository;
  /** 从当前 Task Artifact 重算 CodingTask 授权。 */
  readonly authorizationResolver: CodingTaskExecutionAuthorizationResolver;
  /** 可信 Repository Root Resolver。 */
  readonly repositoryRootResolver: RepositoryRootResolverPort;
  /** Repository 级互斥锁。 */
  readonly repositoryLock: RepositoryLockPort;
  /** 只读复验 ChangeSet-bound Checkpoint 的端口。 */
  readonly checkpointInspector: Pick<ChangeSetCheckpointPort, "inspect">;
  /** 追加内部 ImplementationSubmitted Event 的 Handler。 */
  readonly codingTaskHandler: CodingTaskCommandHandler;
  /** 阻止未闭合 Worktree Provision Action 被 Delivery 绕过。 */
  readonly unresolvedProvisionGuard: UnresolvedWorktreeProvisionGuard;
  /** 统一 RFC 8785 Digest 端口。 */
  readonly digest: ContentDigestPort;
}

/** Session Delivery Application 当前公开的首个生产入口。 */
export interface CodingTaskSessionDeliveryApplicationFactoryOutput {
  /** 将 Effective Closeout 接纳为 CodingTask Submission。 */
  readonly submitCodingTaskSessionDelivery: CodingTaskSessionDeliverySubmissionService;
}

/** 创建只读复验 Git、只写 CodingTask Event 的 Session Delivery Application。 */
export function createCodingTaskSessionDeliveryApplication(
  input: CodingTaskSessionDeliveryApplicationFactoryInput,
): CodingTaskSessionDeliveryApplicationFactoryOutput {
  const closeoutStateStore = new FileCodingTaskSessionCloseoutStore(
    input.storeRoot,
    input.storeDependencies,
  );
  const handler = new CodingTaskSessionDeliverySubmissionHandler({
    closeoutStateStore,
    effectiveCloseoutResolver: input.effectiveCloseoutResolver,
    codingTaskRepository: input.codingTaskRepository,
    authorizationResolver: input.authorizationResolver,
    repositoryRootResolver: input.repositoryRootResolver,
    repositoryLock: input.repositoryLock,
    checkpointInspector: input.checkpointInspector,
    codingTaskHandler: input.codingTaskHandler,
    unresolvedProvisionGuard: input.unresolvedProvisionGuard,
    digest: input.digest,
  });
  return {
    submitCodingTaskSessionDelivery: new CodingTaskSessionDeliverySubmissionService(
      input.applicationCommandGateway,
      handler,
    ),
  };
}
