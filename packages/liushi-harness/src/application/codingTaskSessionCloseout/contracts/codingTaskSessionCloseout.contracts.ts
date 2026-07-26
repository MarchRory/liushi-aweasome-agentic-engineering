import type { ActionExecutionResult } from "#application/actionExecution/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type {
  CodingTaskSessionBeginClosingInput,
  CodingTaskSessionBeginClosingResult,
} from "#application/codingTaskSession/index.js";
import type { ChangeSetCheckpointPort } from "#application/changeSetCheckpoint/index.js";
import type {
  CodingTaskSessionActionCoverageInput,
  CodingTaskSessionActionCoverageManifest,
} from "#application/codingTaskSessionActionCoverage/index.js";
import type {
  CodingTaskSessionCloseoutState,
  CodingTaskSessionCloseoutStateResult,
} from "#application/codingTaskSessionCloseoutState/index.js";
import type { CodingTaskSessionCloseoutStateStore } from "#application/ports/codingTaskSessionCloseoutStateStore/index.js";
import type {
  CodingTaskSessionActivationRepository,
  CodingTaskRepository,
  ContentDigestPort,
  HookBindingStore,
  ManagedWorktreePathPort,
  RepositoryLockPort,
  RepositoryRootResolverPort,
} from "#application/ports/index.js";
import type { InspectGitChangeSetInput } from "#application/ports/gitChangeSetInspector/index.js";
import type { Clock, HarnessError, Result } from "#common/index.js";
import type { CodingTaskAggregateRecord } from "#domain/codingTask/index.js";
import type {
  CodingTaskSessionActivationRecord,
  CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import type { SessionHookBinding } from "#application/executorHooks/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** Closeout Command 允许携带的唯一业务 Payload。 */
export interface CodingTaskSessionCloseoutPayload {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
}

/** 严格解析后的 Closeout Command Envelope。 */
export type CodingTaskSessionCloseoutCommand = CommandEnvelope<CodingTaskSessionCloseoutPayload>;

/** 通过 Admission Coordinator 关闭 Session Action Admission 的窄契约。 */
export interface CodingTaskSessionCloseoutAdmissionCloser {
  /** 在调用方持有 Repository Lock 时复验并关闭 Admission。 */
  beginClosing(
    input: CodingTaskSessionBeginClosingInput,
  ): Promise<Result<CodingTaskSessionBeginClosingResult, HarnessError>>;
}

/** 从权威 Action Journal 与 Trace 构建 Coverage 的窄契约。 */
export interface CodingTaskSessionCloseoutCoverageBuilder {
  /** 在调用方持有 Repository Lock 时创建完整 Coverage Manifest。 */
  create(
    input: CodingTaskSessionActionCoverageInput,
  ): Promise<Result<CodingTaskSessionActionCoverageManifest, HarnessError>>;
}

/** 从受管 Worktree 读取权威 ChangeSet Snapshot 的窄契约。 */
export interface CodingTaskSessionCloseoutSnapshotInspector {
  /** 在调用方持有 Repository Lock 时读取提交前 Snapshot。 */
  execute(
    input: InspectGitChangeSetInput,
  ): Promise<Result<NonNullable<CodingTaskSessionCloseoutState["snapshot"]>, HarnessError>>;
}

/** Closeout Manager 的完整依赖端口集合。 */
export interface CodingTaskSessionCloseoutManagerDependencies {
  /** v3 Closeout State 持久化 Store。 */
  readonly stateStore: CodingTaskSessionCloseoutStateStore<CodingTaskSessionCloseoutState>;
  /** 不可变 Session Activation Repository。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** 权威 CodingTask Aggregate Repository。 */
  readonly codingTaskRepository: CodingTaskRepository;
  /** Session Hook Binding 绑定 Store。 */
  readonly bindingStore: HookBindingStore;
  /** 可信 Repository Root Resolver。 */
  readonly repositoryRootResolver: RepositoryRootResolverPort;
  /** 受管 Worktree Root 解析端口。 */
  readonly managedWorktreePath: ManagedWorktreePathPort;
  /** Repository 级互斥锁。 */
  readonly repositoryLock: RepositoryLockPort;
  /** Admission 关闭窄契约。 */
  readonly admissionCloser: CodingTaskSessionCloseoutAdmissionCloser;
  /** Coverage 构建窄契约。 */
  readonly coverageBuilder: CodingTaskSessionCloseoutCoverageBuilder;
  /** Snapshot 检查窄契约。 */
  readonly snapshotInspector: CodingTaskSessionCloseoutSnapshotInspector;
  /** ChangeSet-bound Checkpoint 端口。 */
  readonly checkpointPort: ChangeSetCheckpointPort;
  /** RFC 8785 Content Digest 端口。 */
  readonly digest: ContentDigestPort;
  /** 统一时钟。 */
  readonly clock: Clock;
}

/** 权威复验通过后的 Closeout 身份上下文。 */
export interface CodingTaskSessionCloseoutAuthority {
  /** 不可变 Activation。 */
  readonly activation: CodingTaskSessionActivationRecord;
  /** 权威 CodingTask Aggregate Record。 */
  readonly codingTask: CodingTaskAggregateRecord;
  /** 完整 Session Hook Binding。 */
  readonly binding: SessionHookBinding;
  /** 可信 Repository Root。 */
  readonly repositoryRoot: string;
  /** 受管 Worktree Root。 */
  readonly worktreeRoot: string;
}

/** Closeout Manager 在锁内执行后的结果及最后可安全触达的 State。 */
export interface CodingTaskSessionCloseoutRunResult {
  /** 对外返回的 State 或错误。 */
  readonly result: CodingTaskSessionCloseoutStateResult;
  /** 最近一次已被可信确认的 State；身份冲突时为 null。 */
  readonly state: CodingTaskSessionCloseoutState | null;
}

/** Closeout State Machine 在 Repository Lock 内执行所需的上下文。 */
export interface CodingTaskSessionCloseoutStateMachineInput {
  /** 已校验的 Closeout Command。 */
  readonly command: CodingTaskSessionCloseoutCommand;
  /** 锁内重新加载并复验的权威身份。 */
  readonly authority: CodingTaskSessionCloseoutAuthority;
  /** 当前已确认的 v3 State。 */
  readonly state: CodingTaskSessionCloseoutState;
  /** State Machine 所需端口。 */
  readonly dependencies: CodingTaskSessionCloseoutManagerDependencies;
}

/** Checkpoint 执行结果分类。 */
export type CodingTaskSessionCloseoutCheckpointResult = Result<ActionExecutionResult, HarnessError>;
