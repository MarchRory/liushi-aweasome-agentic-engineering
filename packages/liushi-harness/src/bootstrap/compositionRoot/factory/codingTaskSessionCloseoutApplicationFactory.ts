import {
  AssessCodingTaskSessionCloseoutRecoveryUseCase,
  CodingTaskSessionActionCoverageService,
  CodingTaskSessionCloseoutManager,
  CodingTaskSessionCloseoutRecoveryCommandHandler,
  CodingTaskSessionCloseoutRecoveryCommandService,
  type ChangeSetCheckpointPort,
  type ChangeSetCheckpointRecoveryPort,
  CodingTaskSessionCloseoutRecoveryAssessmentService,
  CodingTaskSessionEffectiveCloseoutResolver,
  type CodingTaskSessionCloseoutManagerDependencies,
  type CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies,
  type InspectGitChangeSetUseCase,
} from "#application/index.js";
import type {
  ApplicationCommandGateway,
  CodingTaskSessionAdmissionCoordinator,
} from "#application/index.js";
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
  FileCodingTaskSessionCloseoutRecoveryStore,
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
  /** 只读 ChangeSet-bound Checkpoint Recovery 端口。 */
  readonly changeSetCheckpointRecovery: ChangeSetCheckpointRecoveryPort;
  /** 统一 RFC 8785 Digest。 */
  readonly digest: ContentDigestPort;
  /** 统一时钟。 */
  readonly clock: Clock;
  /** 复用 Composition Root 唯一的幂等命令执行网关。 */
  readonly applicationCommandGateway: ApplicationCommandGateway;
}

/** 独立 Closeout Application Factory 的公开结果。 */
export interface CodingTaskSessionCloseoutApplicationFactoryOutput {
  /** 可恢复的 CodingTask Session Closeout Manager。 */
  readonly closeoutCodingTaskSession: CodingTaskSessionCloseoutManager;
  /** 只读评估 Closeout Recovery 当前唯一可行 Resolution。 */
  readonly assessCodingTaskSessionCloseoutRecovery: AssessCodingTaskSessionCloseoutRecoveryUseCase;
  /** 通过统一命令网关执行经 Human Gate 批准的 Closeout Recovery。 */
  readonly recoverCodingTaskSessionCloseout: CodingTaskSessionCloseoutRecoveryCommandService;
  /** 解析原始 Closeout 与 Recovery 后的最终有效 Checkpoint。 */
  readonly resolveCodingTaskSessionEffectiveCloseout: CodingTaskSessionEffectiveCloseoutResolver;
}

/** 创建不暴露基础设施实现的 Closeout Manager。 */
export function createCodingTaskSessionCloseoutApplication(
  input: CodingTaskSessionCloseoutApplicationFactoryInput,
): CodingTaskSessionCloseoutApplicationFactoryOutput {
  const stateStore = new FileCodingTaskSessionCloseoutStore(
    input.storeRoot,
    input.storeDependencies,
  );
  const recoveryStateStore = new FileCodingTaskSessionCloseoutRecoveryStore(
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
  const recoveryDependencies: CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies = {
    stateStore,
    activationRepository: input.activationRepository,
    codingTaskRepository: input.codingTaskRepository,
    bindingStore: input.bindingStore,
    repositoryRootResolver: input.repositoryRootResolver,
    managedWorktreePath: input.managedWorktreePath,
    snapshotInspector: input.inspectGitChangeSet,
    checkpointRecovery: input.changeSetCheckpointRecovery,
    digest: input.digest,
  };
  const recoveryAssessment = new CodingTaskSessionCloseoutRecoveryAssessmentService(
    recoveryDependencies,
  );
  const recoveryHandler = new CodingTaskSessionCloseoutRecoveryCommandHandler({
    assessmentService: recoveryAssessment,
    activationRepository: input.activationRepository,
    repositoryLock: input.repositoryLock,
    checkpoint: input.changeSetCheckpoints,
    digest: input.digest,
    clock: input.clock,
    recoveryStateStore,
  });
  return {
    closeoutCodingTaskSession: new CodingTaskSessionCloseoutManager(dependencies),
    assessCodingTaskSessionCloseoutRecovery: new AssessCodingTaskSessionCloseoutRecoveryUseCase(
      recoveryAssessment,
    ),
    recoverCodingTaskSessionCloseout: new CodingTaskSessionCloseoutRecoveryCommandService(
      input.applicationCommandGateway,
      recoveryHandler,
    ),
    resolveCodingTaskSessionEffectiveCloseout: new CodingTaskSessionEffectiveCloseoutResolver({
      closeoutStateStore: stateStore,
      recoveryStateStore,
      digest: input.digest,
    }),
  };
}
