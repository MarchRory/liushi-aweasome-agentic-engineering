import {
  CodingTaskSessionActionCoverageService,
  CodingTaskSessionCloseoutManager,
  type ChangeSetCheckpointPort,
  type CodingTaskSessionCloseoutManagerDependencies,
  type InspectGitChangeSetUseCase,
} from "#application/index.js";
import type { CodingTaskSessionAdmissionCoordinator } from "#application/index.js";
import type {
  ActionJournalRepository,
  CodingTaskRepository,
  CodingTaskSessionActivationRepository,
  CodingTaskSessionAdmissionStateStore,
  ContentDigestPort,
  HookBindingStore,
  ManagedWorktreePathPort,
  RepositoryLockPort,
  RepositoryRootResolverPort,
  TraceObservationStore,
} from "#application/ports/index.js";
import type { Clock } from "#common/index.js";
import {
  FileCodingTaskSessionCloseoutStore,
  type FileCodingTaskSessionActivationRepositoryDependencies,
} from "#infrastructure/index.js";

/** CodingTask Session Closeout Application Factory 的装配输入。 */
export interface CodingTaskSessionCloseoutApplicationFactoryInput {
  /** Runtime Store 根目录。 */
  readonly storeRoot: string;
  /** Activation、Closeout 共用的文件设施端口。 */
  readonly storeDependencies: FileCodingTaskSessionActivationRepositoryDependencies;
  /** 权威 CodingTask Aggregate Repository。 */
  readonly codingTaskRepository: CodingTaskRepository;
  /** 不可变 Activation 持久化 Repository。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** Session Hook Binding 绑定 Store。 */
  readonly bindingStore: HookBindingStore;
  /** Admission State 持久化 Store。 */
  readonly admissionStateStore: CodingTaskSessionAdmissionStateStore;
  /** Admission 关闭协调器。 */
  readonly admissionCoordinator: CodingTaskSessionAdmissionCoordinator;
  /** Action Journal 持久化 Repository。 */
  readonly actionJournalRepository: ActionJournalRepository;
  /** Trace Observation 持久化 Store。 */
  readonly traceObservationStore: TraceObservationStore;
  /** 可信 Repository Root Resolver。 */
  readonly repositoryRootResolver: RepositoryRootResolverPort;
  /** Managed Worktree Root 解析端口。 */
  readonly managedWorktreePath: ManagedWorktreePathPort;
  /** Repository 互斥 Lock。 */
  readonly repositoryLock: RepositoryLockPort;
  /** 权威 Snapshot Use Case。 */
  readonly inspectGitChangeSet: InspectGitChangeSetUseCase;
  /** ChangeSet-bound Checkpoint 执行端口。 */
  readonly changeSetCheckpoints: ChangeSetCheckpointPort;
  /** 统一 RFC 8785 Digest。 */
  readonly digest: ContentDigestPort;
  /** 统一时钟。 */
  readonly clock: Clock;
}

/** 独立 Closeout Application Factory 的公开结果。 */
export interface CodingTaskSessionCloseoutApplicationFactoryOutput {
  /** 可恢复的 CodingTask Session Closeout Manager。 */
  readonly closeoutCodingTaskSession: CodingTaskSessionCloseoutManager;
}

/** 创建不暴露基础设施实现的 Closeout Manager。 */
export function createCodingTaskSessionCloseoutApplication(
  input: CodingTaskSessionCloseoutApplicationFactoryInput,
): CodingTaskSessionCloseoutApplicationFactoryOutput {
  const stateStore = new FileCodingTaskSessionCloseoutStore(
    input.storeRoot,
    input.storeDependencies,
  );
  const coverageBuilder = new CodingTaskSessionActionCoverageService({
    activationRepository: input.activationRepository,
    admissionStateStore: input.admissionStateStore,
    actionJournalRepository: input.actionJournalRepository,
    traceObservationStore: input.traceObservationStore,
    contentDigest: input.digest,
  });
  const dependencies: CodingTaskSessionCloseoutManagerDependencies = {
    stateStore,
    activationRepository: input.activationRepository,
    codingTaskRepository: input.codingTaskRepository,
    bindingStore: input.bindingStore,
    repositoryRootResolver: input.repositoryRootResolver,
    managedWorktreePath: input.managedWorktreePath,
    repositoryLock: input.repositoryLock,
    admissionCloser: input.admissionCoordinator,
    coverageBuilder,
    snapshotInspector: input.inspectGitChangeSet,
    checkpointPort: input.changeSetCheckpoints,
    digest: input.digest,
    clock: input.clock,
  };
  return { closeoutCodingTaskSession: new CodingTaskSessionCloseoutManager(dependencies) };
}
