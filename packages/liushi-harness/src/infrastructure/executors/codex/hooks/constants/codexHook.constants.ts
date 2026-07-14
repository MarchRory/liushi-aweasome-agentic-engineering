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
