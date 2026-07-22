import {
  ActionHookAuthorizationPolicy,
  BindHookWorkspaceUseCase,
  CanonicalHookDispatcher,
  ProbeCodexCapabilitiesUseCase,
  type ApplicationCommandGateway,
} from "#application/index.js";
import type {
  ActionJournalRepository,
  ContentDigestPort,
  TaskRepository,
  TraceObservationStore,
} from "#application/ports/index.js";
import type { Clock } from "#common/index.js";
import {
  CodexCapabilityProbeAdapter,
  CodexHookAdapter,
  FileHookBindingStore,
  type FileLockManager,
  type ParentDirectoryDurability,
  type CommandRunner,
} from "#infrastructure/index.js";

/** Hook Application 装配所需的可信依赖。 */
export interface HookApplicationFactoryInput {
  /** Runtime Store 绝对根目录。 */
  readonly storeRoot: string;
  /** 统一 Application Command Gateway。 */
  readonly applicationCommandGateway: ApplicationCommandGateway;
  /** Task 与 Human Gate 的权威 Repository。 */
  readonly taskRepository: TaskRepository;
  /** Action Intent 与 Observation 的权威 Repository。 */
  readonly actionJournalRepository: ActionJournalRepository;
  /** 可丢失 Trace Observation Store。 */
  readonly traceObservationStore: TraceObservationStore;
  /** 规范 Content Digest Port。 */
  readonly digest: ContentDigestPort;
  /** 统一运行时 Clock。 */
  readonly clock: Clock;
  /** 宿主命令执行边界。 */
  readonly commandRunner: CommandRunner;
  /** 跨进程文件锁。 */
  readonly lockManager: FileLockManager;
  /** 原子写入后的父目录耐久化边界。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}

/** Hook Application 对 Composition Root 暴露的能力。 */
export interface HookApplicationFactoryOutput {
  /** Human 批准后的 Hook Workspace Binding。 */
  readonly bindHookWorkspace: BindHookWorkspaceUseCase;
  /** 执行器无关的 Canonical Hook Dispatcher。 */
  readonly handleHook: CanonicalHookDispatcher;
  /** Codex 平台 Hook Adapter。 */
  readonly handleCodexHook: CodexHookAdapter;
  /** Codex 静态能力探测。 */
  readonly probeCodexCapabilities: ProbeCodexCapabilitiesUseCase;
}

/** 在 Bootstrap 边界构造 Hook Store、Policy、Dispatcher 与 Codex Adapter。 */
export function createHookApplication(
  input: HookApplicationFactoryInput,
): HookApplicationFactoryOutput {
  const hookBindingStore = new FileHookBindingStore(input.storeRoot, {
    lockManager: input.lockManager,
    parentDirectoryDurability: input.parentDirectoryDurability,
  });
  const authorizationPolicy = new ActionHookAuthorizationPolicy(input.taskRepository);
  const dispatcher = new CanonicalHookDispatcher(
    input.applicationCommandGateway,
    authorizationPolicy,
    input.actionJournalRepository,
    input.traceObservationStore,
    input.digest,
  );
  return {
    bindHookWorkspace: new BindHookWorkspaceUseCase(
      input.taskRepository,
      hookBindingStore,
      input.clock,
    ),
    handleHook: dispatcher,
    handleCodexHook: new CodexHookAdapter(
      dispatcher,
      hookBindingStore,
      input.actionJournalRepository,
      input.taskRepository,
      input.digest,
      input.clock,
    ),
    probeCodexCapabilities: new ProbeCodexCapabilitiesUseCase(
      new CodexCapabilityProbeAdapter(input.commandRunner),
    ),
  };
}
