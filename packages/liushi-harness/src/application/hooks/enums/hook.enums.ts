/** Harness 定义并由 Executor Adapter 映射的生命周期事件。 */
export enum HarnessHookEvent {
  /** Executor Session 开始。 */
  SessionStart = "session_start",
  /** Human Prompt 提交。 */
  UserPromptSubmit = "user_prompt_submit",
  /** 副作用执行之前。 */
  PreAction = "pre_action",
  /** 副作用执行之后。 */
  PostAction = "post_action",
  /** 上下文压缩之前。 */
  PreCompact = "pre_compact",
  /** 上下文压缩之后。 */
  PostCompact = "post_compact",
  /** 受限 Agent Role 开始。 */
  AgentStart = "agent_start",
  /** 受限 Agent Role 结束。 */
  AgentStop = "agent_stop",
  /** 顶层 Turn 准备结束。 */
  TurnStop = "turn_stop",
}

/** Canonical Hook Handler 对 Executor 后续行为的要求。 */
export enum HookDecision {
  /** 检查通过，允许继续。 */
  Allow = "allow",
  /** 当前 Handler 不拥有决定权。 */
  Defer = "defer",
  /** 违反 Policy 或缺少 Gate，必须阻止。 */
  Deny = "deny",
  /** 当前结果允许受控重试或继续一次。 */
  Continue = "continue",
  /** Hook 自身失败，按事件失败策略处理。 */
  Error = "error",
}

/** Hook Result 对外公开的稳定失败类别。 */
export enum HookFailureKind {
  /** Hook Command 或 Payload 无效。 */
  InvalidInput = "invalid_input",
  /** 当前计划、写集或 Human Gate 不授权该动作。 */
  AuthorizationDenied = "authorization_denied",
  /** Hook Command 与已有幂等调用冲突。 */
  Conflict = "conflict",
  /** 副作用或持久化结果未知。 */
  OutcomeUnknown = "outcome_unknown",
  /** Hook 内部依赖不可用。 */
  Internal = "internal",
}

/** Canonical Hook 当前支持的 Executor 家族。 */
export enum HookExecutorKind {
  /** OpenAI Codex 执行器。 */
  Codex = "codex",
  /** Claude Code 或兼容实现。 */
  ClaudeCompatible = "claude_compatible",
  /** 仅实现 Canonical CLI 协议的通用 Executor。 */
  Generic = "generic",
}
