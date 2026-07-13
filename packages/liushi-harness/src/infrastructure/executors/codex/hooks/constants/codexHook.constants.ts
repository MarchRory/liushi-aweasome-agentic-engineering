/** Codex 当前由 Harness Adapter 支持的 Hook 事件集合。 */
export enum CodexHookEvent {
  /** 工具执行前的权限检查。 */
  PreToolUse = "PreToolUse",
  /** 工具执行后的结果观察。 */
  PostToolUse = "PostToolUse",
}

/** Codex 传入的权限模式封闭集合。 */
export enum CodexPermissionMode {
  /** 普通权限模式。 */
  Default = "default",
  /** 自动接受编辑模式。 */
  AcceptEdits = "acceptEdits",
  /** 规划模式。 */
  Plan = "plan",
  /** 不再询问模式。 */
  DontAsk = "dontAsk",
  /** 已绕过权限模式。 */
  BypassPermissions = "bypassPermissions",
}

/** 当前 Adapter 允许进入 Canonical Action 的 Codex 工具集合。 */
export enum CodexSupportedTool {
  /** Codex 内置 apply_patch 文件编辑工具。 */
  ApplyPatch = "apply_patch",
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
