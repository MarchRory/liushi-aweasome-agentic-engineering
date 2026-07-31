/** Codex App Server Turn 状态。 */
export enum CODEX_APP_SERVER_TURN_STATUSES {
  /** Turn 已完成。 */
  Completed = "completed",
  /** Turn 执行失败。 */
  Failed = "failed",
  /** Turn 正在执行。 */
  InProgress = "inProgress",
  /** Turn 被中断。 */
  Interrupted = "interrupted",
}

/** Codex App Server Item 状态。 */
export enum CODEX_APP_SERVER_ITEM_STATUSES {
  /** Item 已完成。 */
  Completed = "completed",
  /** Item 被拒绝或取消。 */
  Declined = "declined",
  /** Item 执行失败。 */
  Failed = "failed",
  /** Item 正在执行。 */
  InProgress = "inProgress",
}

/** Runner 对外报告的执行结果。 */
export enum CODEX_APP_SERVER_OUTCOMES {
  /** 执行成功。 */
  Succeeded = "succeeded",
  /** 执行失败。 */
  Failed = "failed",
  /** 执行被策略拒绝。 */
  Denied = "denied",
  /** 执行被超时或限制中断。 */
  Interrupted = "interrupted",
  /** 进程树是否终止无法确认。 */
  OutcomeUnknown = "outcome_unknown",
}

/** Runner 终止请求的原因。 */
export enum CODEX_APP_SERVER_TERMINATION_REASONS {
  /** 授权回调或结果错误。 */
  AuthorizationError = "authorization-error",
  /** Runner 输入错误。 */
  InputError = "input-error",
  /** 标准输出超过限制。 */
  OutputLimit = "output-limit",
  /** 上层策略拒绝。 */
  PolicyDenied = "policy-denied",
  /** 子进程错误。 */
  ProcessError = "process-error",
  /** 协议错误。 */
  ProtocolError = "protocol-error",
  /** 标准错误超过限制。 */
  StderrLimit = "stderr-limit",
  /** 执行超时。 */
  Timeout = "timeout",
}

/** Codex App Server 受限协议阶段。 */
export enum CODEX_APP_SERVER_PROTOCOL_PHASES {
  /** 尚未发送初始化请求。 */
  Created = "created",
  /** 等待初始化响应。 */
  InitializePending = "initialize-pending",
  /** 等待线程响应。 */
  ThreadPending = "thread-pending",
  /** 等待 Turn 响应。 */
  TurnPending = "turn-pending",
  /** Turn 正在执行。 */
  Running = "running",
  /** Turn 已完成。 */
  Completed = "completed",
}

/** Codex App Server 线程状态。 */
export enum CODEX_APP_SERVER_THREAD_STATUS {
  /** 线程处于活动状态。 */
  Active = "active",
  /** 线程处于空闲状态。 */
  Idle = "idle",
}

/** Codex App Server 允许的线程活动标记。 */
export enum CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS {
  /** 线程正在等待文件审批。 */
  WaitingOnApproval = "waitingOnApproval",
}

/** 协议内部记录的 Item 类别。 */
export enum CodexAppServerFileItemState {
  /** 文件变更 Item。 */
  FileChange = "file-change",
  /** 非文件变更 Item。 */
  Other = "other",
}

/** 协议内部记录的审批状态。 */
export enum CodexAppServerApprovalState {
  /** 已接受。 */
  Accepted = "accepted",
  /** 已拒绝或取消。 */
  Denied = "denied",
}

/** 兼容旧调用方的终止原因枚举别名。 */
export { CODEX_APP_SERVER_TERMINATION_REASONS as CodexAppServerTerminationReason };

Object.freeze(CODEX_APP_SERVER_TURN_STATUSES);
Object.freeze(CODEX_APP_SERVER_ITEM_STATUSES);
Object.freeze(CODEX_APP_SERVER_OUTCOMES);
Object.freeze(CODEX_APP_SERVER_TERMINATION_REASONS);
Object.freeze(CODEX_APP_SERVER_PROTOCOL_PHASES);
Object.freeze(CODEX_APP_SERVER_THREAD_STATUS);
Object.freeze(CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS);
Object.freeze(CodexAppServerFileItemState);
Object.freeze(CodexAppServerApprovalState);
