import type {
  ChangeSetCheckpointInput,
  ChangeSetCheckpointRecoveryAssessment,
  ChangeSetCheckpointRecoveryPort,
} from "#application/changeSetCheckpoint/index.js";
import type {
  CodingTaskSessionCloseoutAuthority,
  CodingTaskSessionCloseoutSnapshotInspector,
} from "#application/codingTaskSessionCloseout/index.js";
import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type {
  CodingTaskSessionActivationRepository,
  CodingTaskRepository,
  CodingTaskSessionCloseoutStateStore,
  ContentDigestPort,
  HookBindingStore,
  ManagedWorktreePathPort,
  RepositoryRootResolverPort,
} from "#application/ports/index.js";

import type { CodingTaskSessionCloseoutRecoveryAssessment } from "../../contracts/index.js";

/** Closeout Recovery Assessment Service 的只读依赖集合。 */
export interface CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies {
  /** v3 Closeout State Store；Service 只调用 load。 */
  readonly stateStore: CodingTaskSessionCloseoutStateStore<CodingTaskSessionCloseoutState>;
  /** 不可变 Session Activation Repository。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** 权威 CodingTask Aggregate Repository。 */
  readonly codingTaskRepository: CodingTaskRepository;
  /** Session Hook Binding 的持久化 Store。 */
  readonly bindingStore: HookBindingStore;
  /** 可信 Repository Root Resolver。 */
  readonly repositoryRootResolver: RepositoryRootResolverPort;
  /** Managed Worktree Root 推导端口。 */
  readonly managedWorktreePath: ManagedWorktreePathPort;
  /** 只读 Snapshot 检查端口。 */
  readonly snapshotInspector: CodingTaskSessionCloseoutSnapshotInspector;
  /** 只读 ChangeSet-bound Checkpoint Recovery 端口。 */
  readonly checkpointRecovery: ChangeSetCheckpointRecoveryPort;
  /** RFC 8785 Content Digest 端口。 */
  readonly digest: ContentDigestPort;
}

/** 供未来锁内 Human Command 复用的完整内部 Assessment。 */
export interface CodingTaskSessionCloseoutRecoveryAssessmentInternal {
  /** 已投影且带 Canonical Digest 的公开 Assessment。 */
  readonly assessment: CodingTaskSessionCloseoutRecoveryAssessment;
  /** 已通过现有 Authority Validation 的 Closeout 身份。 */
  readonly authority: CodingTaskSessionCloseoutAuthority;
  /** 已严格重建并加载的 v3 Closeout State。 */
  readonly state: CodingTaskSessionCloseoutState;
  /** 从权威身份与 Snapshot 确定性重建的 Checkpoint 输入；Closing 时为 null。 */
  readonly checkpointInput: ChangeSetCheckpointInput | null;
  /** 完整的只读 Checkpoint Recovery 三态结果。 */
  readonly checkpointRecovery: ChangeSetCheckpointRecoveryAssessment;
}
