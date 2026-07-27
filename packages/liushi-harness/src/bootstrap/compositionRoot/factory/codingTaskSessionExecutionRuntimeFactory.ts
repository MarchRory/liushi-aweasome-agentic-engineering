import { JournaledActionRunner } from "#application/index.js";
import type { ApplicationCommandGateway } from "#application/index.js";
import type {
  ActionExecutionLockPort,
  ActionJournalRepository,
  CodingTaskRepository,
  ManagedWorktreePathPort,
  RepositoryLockPort,
  RepositoryRootResolverPort,
  TraceObservationStore,
} from "#application/ports/index.js";
import type { Clock, IdGenerator } from "#common/index.js";
import {
  FileActionExecutionLockAdapter,
  NodeCodingTaskCellRuntimePathAdapter,
  NodeRepositoryLockAdapter,
  type FileCodingTaskSessionActivationRepositoryDependencies,
} from "#infrastructure/index.js";

import type { ChangeSetCheckpointApplicationFactoryOutput } from "./changeSetCheckpointApplicationFactory.js";
import {
  createCodingTaskSessionCloseoutApplication,
  type CodingTaskSessionCloseoutApplicationFactoryOutput,
} from "./codingTaskSessionCloseoutApplicationFactory.js";
import type { CodingTaskSessionHookRuntimeFactoryOutput } from "./codingTaskSessionHookRuntimeFactory.js";

/** Session 执行基础设施与 Closeout Application 的集中装配输入。 */
export interface CodingTaskSessionExecutionRuntimeFactoryInput {
  /** Runtime Store 绝对根目录。 */
  readonly storeRoot: string;
  /** 文件存储共享的摘要、锁与目录耐久化依赖。 */
  readonly storeDependencies: FileCodingTaskSessionActivationRepositoryDependencies;
  /** CodingTask Aggregate 权威 Repository。 */
  readonly codingTaskRepository: CodingTaskRepository;
  /** Session Hook 与 Admission 运行时。 */
  readonly hookRuntime: CodingTaskSessionHookRuntimeFactoryOutput;
  /** Action Journal 权威 Repository。 */
  readonly actionJournalRepository: ActionJournalRepository;
  /** 可丢失 Trace Observation 存储。 */
  readonly traceObservationStore: TraceObservationStore;
  /** 权威 Repository Root Resolver。 */
  readonly repositoryRootResolver: RepositoryRootResolverPort;
  /** ChangeSet 检查与 Checkpoint Application。 */
  readonly changeSetApplication: ChangeSetCheckpointApplicationFactoryOutput;
  /** 统一运行时 Clock。 */
  readonly clock: Clock;
  /** Repository Lock ID 生成器。 */
  readonly repositoryLockIdGenerator: IdGenerator;
  /** 复用 Composition Root 唯一的幂等命令执行网关。 */
  readonly applicationCommandGateway: ApplicationCommandGateway;
}

/** Session 执行链共享的基础设施与 Closeout Application。 */
export interface CodingTaskSessionExecutionRuntimeFactoryOutput {
  /** Repository 级排他 Lock。 */
  readonly repositoryLock: RepositoryLockPort;
  /** Action 级执行 Lock。 */
  readonly actionExecutionLock: ActionExecutionLockPort;
  /** 带意图日志与恢复语义的 Action Runner。 */
  readonly journaledActionRunner: JournaledActionRunner;
  /** 受管 Worktree 路径解析端口。 */
  readonly managedWorktreePath: ManagedWorktreePathPort;
  /** 可恢复 Closeout Application。 */
  readonly closeoutApplication: CodingTaskSessionCloseoutApplicationFactoryOutput;
}

/** 装配 Session 执行共享能力，避免 Composition Root 暴露平台实现细节。 */
export function createCodingTaskSessionExecutionRuntime(
  input: CodingTaskSessionExecutionRuntimeFactoryInput,
): CodingTaskSessionExecutionRuntimeFactoryOutput {
  const repositoryLock = new NodeRepositoryLockAdapter(
    input.storeRoot,
    input.storeDependencies.lockManager,
    input.clock,
    input.repositoryLockIdGenerator,
  );
  const actionExecutionLock = new FileActionExecutionLockAdapter(
    input.storeRoot,
    input.storeDependencies.lockManager,
  );
  const journaledActionRunner = new JournaledActionRunner(
    input.actionJournalRepository,
    input.clock,
    actionExecutionLock,
  );
  const managedWorktreePath = new NodeCodingTaskCellRuntimePathAdapter();
  const closeoutApplication = createCodingTaskSessionCloseoutApplication({
    storeRoot: input.storeRoot,
    storeDependencies: input.storeDependencies,
    codingTaskRepository: input.codingTaskRepository,
    activationRepository: input.hookRuntime.persistence.activationRepository,
    bindingStore: input.hookRuntime.bindingStore,
    admissionStateStore: input.hookRuntime.persistence.admissionStateStore,
    admissionCoordinator: input.hookRuntime.admissionCoordinator,
    actionJournalRepository: input.actionJournalRepository,
    traceObservationStore: input.traceObservationStore,
    repositoryRootResolver: input.repositoryRootResolver,
    managedWorktreePath,
    repositoryLock,
    inspectGitChangeSet: input.changeSetApplication.inspectGitChangeSet,
    changeSetCheckpoints: input.changeSetApplication.changeSetCheckpoints,
    changeSetCheckpointRecovery: input.changeSetApplication.changeSetCheckpointRecovery,
    digest: input.storeDependencies.digest,
    clock: input.clock,
    applicationCommandGateway: input.applicationCommandGateway,
  });
  return {
    repositoryLock,
    actionExecutionLock,
    journaledActionRunner,
    managedWorktreePath,
    closeoutApplication,
  };
}
