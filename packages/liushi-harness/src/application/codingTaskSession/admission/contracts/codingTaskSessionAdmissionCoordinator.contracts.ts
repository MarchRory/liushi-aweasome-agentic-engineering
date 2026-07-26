import type { SessionPreActionHookPayload } from "#application/hooks/index.js";
import type {
  ActionJournalRepository,
  CodingTaskSessionActivationRepository,
  CodingTaskSessionAdmissionLease,
  CodingTaskSessionAdmissionStateStore,
  ContentDigestPort,
  HookBindingStore,
  TraceObservationStore,
} from "#application/ports/index.js";
import type { HarnessError, Result } from "#common/index.js";
import type {
  CodingTaskSessionAdmissionState,
  CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** Session PreAction 所需的权威授权窄端口。 */
export interface CodingTaskSessionActionAuthorizationPort {
  /** 从 Task Replay、PlanRisk 与 Human Gate 重算当前文件动作授权。 */
  authorize(payload: SessionPreActionHookPayload): Promise<Result<unknown, HarnessError>>;
}

/** Session Action Admission Coordinator 的完整依赖集合。 */
export interface CodingTaskSessionAdmissionCoordinatorDependencies {
  /** 精确读取 Session Hook Binding v2 的 Store。 */
  readonly bindingStore: HookBindingStore;
  /** 不可变 Session Activation Record Repository。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** Admission 控制状态存储。 */
  readonly stateStore: CodingTaskSessionAdmissionStateStore;
  /** 覆盖 State 与 Action Journal 的排他 Lease。 */
  readonly admissionLease: CodingTaskSessionAdmissionLease;
  /** Action Intent、Observation 与 Resolution Repository。 */
  readonly actionJournal: ActionJournalRepository;
  /** 可丢失但必须记录写入结果的 Trace Store。 */
  readonly traceStore: TraceObservationStore;
  /** PreAction 的权威 Human Gate 授权端口。 */
  readonly authorization: CodingTaskSessionActionAuthorizationPort;
  /** RFC 8785 内容摘要端口。 */
  readonly digest: ContentDigestPort;
}

/** 在 S3 编排前原子关闭新 Action Admission 的输入。 */
export interface CodingTaskSessionBeginClosingInput {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** 状态迁移的规范 ISO UTC 时间。 */
  readonly updatedAt: string;
}

/** 成功关闭新 Admission 后的稳定结果。 */
export interface CodingTaskSessionBeginClosingResult {
  /** 已进入 closing 的权威 Admission State。 */
  readonly state: CodingTaskSessionAdmissionState;
}
