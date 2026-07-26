import {
  ActionHookAuthorizationPolicy,
  CodingTaskSessionAdmissionCoordinator,
  InitializeCodingTaskSessionAdmissionService,
  type ApplicationCommandGateway,
} from "#application/index.js";
import type {
  ActionJournalRepository,
  TaskRepository,
  TraceObservationStore,
} from "#application/ports/index.js";
import type { Clock } from "#common/index.js";
import {
  FileHookBindingStore,
  type CommandRunner,
  type FileCodingTaskSessionActivationRepositoryDependencies,
} from "#infrastructure/index.js";

import {
  createCodingTaskSessionPersistence,
  type CodingTaskSessionPersistence,
} from "./codingTaskSessionPersistenceFactory.js";
import {
  createHookApplication,
  type HookApplicationFactoryOutput,
} from "./hookApplicationFactory.js";

/** Session Hook 运行时装配所需的基础设施与权威存储。 */
export interface CodingTaskSessionHookRuntimeFactoryInput {
  /** Runtime Store 绝对根目录。 */
  readonly storeRoot: string;
  /** 文件存储共享的摘要、锁与目录耐久化依赖。 */
  readonly storeDependencies: FileCodingTaskSessionActivationRepositoryDependencies;
  /** 统一应用命令网关。 */
  readonly applicationCommandGateway: ApplicationCommandGateway;
  /** Task 与 Human Gate 的权威存储。 */
  readonly taskRepository: TaskRepository;
  /** Action Journal 的权威存储。 */
  readonly actionJournalRepository: ActionJournalRepository;
  /** 可丢失 Trace Observation 存储。 */
  readonly traceObservationStore: TraceObservationStore;
  /** 统一运行时 Clock。 */
  readonly clock: Clock;
  /** Codex 能力探测使用的命令边界。 */
  readonly commandRunner: CommandRunner;
}

/** Session Hook 与 Admission 运行时的集中装配结果。 */
export interface CodingTaskSessionHookRuntimeFactoryOutput {
  /** Session Activation 与 Admission 文件存储。 */
  readonly persistence: CodingTaskSessionPersistence;
  /** Activation 完成后建立 Binding v2 与 Admission State 的服务。 */
  readonly admissionInitializer: InitializeCodingTaskSessionAdmissionService;
  /** Canonical Hook Dispatcher 与 Codex Adapter。 */
  readonly hookApplication: HookApplicationFactoryOutput;
}

/** 构造共享 Binding、授权策略、Admission Coordinator 与 Hook Application。 */
export function createCodingTaskSessionHookRuntime(
  input: CodingTaskSessionHookRuntimeFactoryInput,
): CodingTaskSessionHookRuntimeFactoryOutput {
  const persistence = createCodingTaskSessionPersistence(input.storeRoot, input.storeDependencies);
  const hookBindingStore = new FileHookBindingStore(input.storeRoot, input.storeDependencies);
  const authorizationPolicy = new ActionHookAuthorizationPolicy(input.taskRepository);
  const admissionInitializer = new InitializeCodingTaskSessionAdmissionService({
    bindingStore: hookBindingStore,
    stateStore: persistence.admissionStateStore,
    digest: input.storeDependencies.digest,
  });
  const admissionCoordinator = new CodingTaskSessionAdmissionCoordinator({
    bindingStore: hookBindingStore,
    activationRepository: persistence.activationRepository,
    stateStore: persistence.admissionStateStore,
    admissionLease: persistence.admissionLease,
    actionJournal: input.actionJournalRepository,
    traceStore: input.traceObservationStore,
    authorization: authorizationPolicy,
    digest: input.storeDependencies.digest,
  });
  const hookApplication = createHookApplication({
    storeRoot: input.storeRoot,
    applicationCommandGateway: input.applicationCommandGateway,
    taskRepository: input.taskRepository,
    hookBindingStore,
    authorizationPolicy,
    sessionActionHandler: admissionCoordinator,
    actionJournalRepository: input.actionJournalRepository,
    traceObservationStore: input.traceObservationStore,
    digest: input.storeDependencies.digest,
    clock: input.clock,
    commandRunner: input.commandRunner,
  });
  return { persistence, admissionInitializer, hookApplication };
}
