import {
  ActivateCodingTaskSessionService,
  type CodingTaskCommandService,
  type CodingTaskSessionAdmissionInitializerPort,
  type CodingTaskSessionRuntimeBinding,
  type WorktreeProvisionCommandService,
} from "#application/index.js";
import type {
  CodingTaskRepository,
  CodingTaskSessionActivationRepository,
  CodingTaskSessionActivationLease,
  ContentDigestPort,
  ManagedWorktreePathPort,
} from "#application/ports/index.js";

/** Session Activation Composition Root 的装配输入。 */
export interface CodingTaskSessionApplicationFactoryInput {
  /** 已经过 Gateway 的 CodingTask 命令服务。 */
  readonly codingTaskCommands: CodingTaskCommandService;
  /** 已经过 Gateway 和 Action Journal 的 Worktree 命令服务。 */
  readonly worktreeProvisionCommands: WorktreeProvisionCommandService;
  /** CodingTask Aggregate 的权威 Repository。 */
  readonly codingTaskRepository: CodingTaskRepository;
  /** 不可变 Session Activation Record Repository。 */
  readonly activationRepository: CodingTaskSessionActivationRepository;
  /** 跨进程 Session Activation 排他 Lease。 */
  readonly activationLease: CodingTaskSessionActivationLease;
  /** 从权威 Activation Record 初始化 Session Action Admission。 */
  readonly admissionInitializer: CodingTaskSessionAdmissionInitializerPort;
  /** 统一的 RFC 8785 Content Digest Port。 */
  readonly digest: ContentDigestPort;
  /** 隔离宿主路径差异的 Worktree Path Port。 */
  readonly runtimePath: ManagedWorktreePathPort;
  /** 可选启动期单仓与审计身份绑定；缺失时 Use Case 关闭式拒绝。 */
  readonly runtimeBinding?: CodingTaskSessionRuntimeBinding;
}

/** Session Activation Composition Root 的公开结果。 */
export interface CodingTaskSessionApplicationFactoryOutput {
  /** 激活外部 Agent CodingTask Session。 */
  readonly activateCodingTaskSession: ActivateCodingTaskSessionService;
}

/** 使用既有命令服务装配 Session Activation，不创建第二套执行内核。 */
export function createCodingTaskSessionApplication(
  input: CodingTaskSessionApplicationFactoryInput,
): CodingTaskSessionApplicationFactoryOutput {
  return {
    activateCodingTaskSession: new ActivateCodingTaskSessionService(
      input.codingTaskCommands,
      input.worktreeProvisionCommands,
      input.codingTaskRepository,
      input.activationRepository,
      input.digest,
      input.runtimePath,
      input.activationLease,
      input.admissionInitializer,
      input.runtimeBinding,
    ),
  };
}
