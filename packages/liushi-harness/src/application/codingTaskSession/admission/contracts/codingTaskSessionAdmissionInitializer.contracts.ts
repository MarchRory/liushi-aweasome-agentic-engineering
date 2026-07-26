import type { HookBindingStore } from "#application/ports/index.js";
import type { SessionHookBinding } from "#application/executorHooks/index.js";
import type {
  CodingTaskSessionAdmissionStateStore,
  ContentDigestPort,
} from "#application/ports/index.js";
import type { HarnessError, Result } from "#common/index.js";
import type {
  CodingTaskSessionActivationRecord,
  CodingTaskSessionAdmissionState,
} from "#domain/codingTaskSession/index.js";

/** 初始化 Session Action Admission 所需的权威输入。 */
export interface CodingTaskSessionAdmissionInitializationInput {
  /** 已完成摘要复验的不可变 Activation Record。 */
  readonly activation: CodingTaskSessionActivationRecord;
  /** 当前进程解析出的规范受管 Worktree Root。 */
  readonly worktreeRoot: string;
}

/** Session Action Admission 初始化后的稳定结果。 */
export interface CodingTaskSessionAdmissionInitializationResult {
  /** 已创建或精确复用的 Session Hook Binding v2。 */
  readonly binding: SessionHookBinding;
  /** 已创建或按不可变身份复用的 Admission State。 */
  readonly state: CodingTaskSessionAdmissionState;
}

/** Activation Service 依赖的 Session Admission 初始化窄端口。 */
export interface CodingTaskSessionAdmissionInitializerPort {
  /** 确保 Binding v2 与 Admission State 同时存在且身份一致。 */
  ensure(
    input: CodingTaskSessionAdmissionInitializationInput,
  ): Promise<Result<CodingTaskSessionAdmissionInitializationResult, HarnessError>>;
}

/** Session Admission 初始化器的依赖集合。 */
export interface CodingTaskSessionAdmissionInitializerDependencies {
  /** v1/v2 Hook Binding 的权威 Store。 */
  readonly bindingStore: HookBindingStore;
  /** Session Admission 控制状态存储。 */
  readonly stateStore: CodingTaskSessionAdmissionStateStore;
  /** RFC 8785 内容摘要端口。 */
  readonly digest: ContentDigestPort;
}
