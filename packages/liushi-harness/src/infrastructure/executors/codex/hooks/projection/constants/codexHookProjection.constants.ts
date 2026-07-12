/** Codex Hook Wrapper 的默认命令。 */
export const CODEX_HOOK_DEFAULT_COMMAND = "liushi-harness hook handle --executor codex";

/** 仅拦截由当前 Adapter 支持的工具名称。 */
export const CODEX_HOOK_DEFAULT_MATCHER = "^apply_patch$";

/** PreToolUse 进入 Canonical Policy 前显示的状态文本。 */
export const CODEX_HOOK_PRE_STATUS_MESSAGE = "校验文件变更权限";

/** PostToolUse 写入 Action Journal 前显示的状态文本。 */
export const CODEX_HOOK_POST_STATUS_MESSAGE = "记录文件变更结果";
