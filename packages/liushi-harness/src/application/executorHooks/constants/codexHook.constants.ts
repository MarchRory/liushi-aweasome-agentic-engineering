/** Codex 原生 Hook 事件集合。 */
export enum CodexHookEvent {
  /** 工具执行前的权限检查。 */
  PreToolUse = "PreToolUse",
  /** 工具执行后的结果观察。 */
  PostToolUse = "PostToolUse",
}

/** Codex Hook 输出中的权限决定集合。 */
export enum CodexPermissionDecision {
  /** 拒绝原始工具调用。 */
  Deny = "deny",
}

/** Codex PostToolUse 用于替换工具结果的决定集合。 */
export enum CodexPostHookDecision {
  /** 将工具结果替换为 Hook 反馈并继续模型循环。 */
  Block = "block",
}

/** Handler 无法可靠完成时返回给 Codex 的稳定安全原因。 */
export const CODEX_HOOK_FAIL_CLOSED_REASON =
  "liushi-harness Hook 处理失败，已安全阻止本次工具调用。";
