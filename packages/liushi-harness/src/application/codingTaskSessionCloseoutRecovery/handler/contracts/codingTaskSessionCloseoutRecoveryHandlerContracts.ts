import type { ChangeSetCheckpointPort } from "#application/changeSetCheckpoint/index.js";
import type { CodingTaskSessionCloseoutRecoveryAssessmentService } from "#application/codingTaskSessionCloseoutRecovery/assessment/index.js";
import type { CodingTaskSessionCloseoutRecoveryState } from "#application/codingTaskSessionCloseoutRecovery/state/index.js";
import type {
  CodingTaskSessionActivationRepository,
  CodingTaskSessionCloseoutRecoveryStateStore,
  ContentDigestPort,
  RepositoryLockPort,
} from "#application/ports/index.js";
import type { Clock } from "#common/index.js";

/** Closeout Recovery Human Command Handler 的窄依赖集合。 */
export interface CodingTaskSessionCloseoutRecoveryHandlerDependencies {
  /** 严格 Human Command parser 所需的规范摘要端口。 */
  readonly digest: ContentDigestPort;
  /** 锁前只读定位 Repository 的 Activation Repository。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** Repository 级互斥锁。 */
  readonly repositoryLock: RepositoryLockPort;
  /** 锁内 fresh reassessment 服务。 */
  readonly assessmentService: CodingTaskSessionCloseoutRecoveryAssessmentService;
  /** 独立 Recovery Process State 的 create-only/CAS Store。 */
  readonly recoveryStateStore: CodingTaskSessionCloseoutRecoveryStateStore<CodingTaskSessionCloseoutRecoveryState>;
  /** ChangeSet-bound Checkpoint 的执行及复验端口。 */
  readonly checkpoint: ChangeSetCheckpointPort;
  /** 可注入的确定性时钟。 */
  readonly clock: Clock;
}
