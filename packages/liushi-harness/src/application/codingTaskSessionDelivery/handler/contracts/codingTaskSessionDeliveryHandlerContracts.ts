import type { CodingTaskCommandHandler } from "#application/codingTask/index.js";
import type { ChangeSetCheckpointPort } from "#application/changeSetCheckpoint/index.js";
import type { CodingTaskSessionEffectiveCloseoutResolverPort } from "#application/codingTaskSessionCloseoutRecovery/index.js";
import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type { UnresolvedWorktreeProvisionGuard } from "#application/worktreeProvisioning/index.js";
import type {
  CodingTaskExecutionAuthorizationResolver,
  CodingTaskRepository,
  CodingTaskSessionCloseoutStateStore,
  ContentDigestPort,
  RepositoryLockPort,
  RepositoryRootResolverPort,
} from "#application/ports/index.js";

/** Session Delivery Submission Handler 的完整依赖集合。 */
export interface CodingTaskSessionDeliverySubmissionHandlerDependencies {
  /** 严格重建 v3 Closeout State 的持久化 Store。 */
  readonly closeoutStateStore: CodingTaskSessionCloseoutStateStore<CodingTaskSessionCloseoutState>;
  /** 解析原 Closeout 或 Recovery 后权威 Checkpoint 的只读端口。 */
  readonly effectiveCloseoutResolver: CodingTaskSessionEffectiveCloseoutResolverPort;
  /** 权威 CodingTask Aggregate Repository。 */
  readonly codingTaskRepository: CodingTaskRepository;
  /** 从当前 Task Approval 与 Write Set 重算执行授权。 */
  readonly authorizationResolver: CodingTaskExecutionAuthorizationResolver;
  /** 解析受信 Repository Root 的端口。 */
  readonly repositoryRootResolver: RepositoryRootResolverPort;
  /** 串行化同一 Repository 内交付状态变化的锁。 */
  readonly repositoryLock: RepositoryLockPort;
  /** 只读复验 ChangeSet-bound Checkpoint 的窄端口。 */
  readonly checkpointInspector: Pick<ChangeSetCheckpointPort, "inspect">;
  /** 持有内部能力后追加 ImplementationSubmitted Event 的 Handler。 */
  readonly codingTaskHandler: CodingTaskCommandHandler;
  /** 阻止未闭合 Worktree Provision Action 被 Delivery 绕过。 */
  readonly unresolvedProvisionGuard: UnresolvedWorktreeProvisionGuard;
  /** 统一 RFC 8785 Content Digest 端口。 */
  readonly digest: ContentDigestPort;
}
