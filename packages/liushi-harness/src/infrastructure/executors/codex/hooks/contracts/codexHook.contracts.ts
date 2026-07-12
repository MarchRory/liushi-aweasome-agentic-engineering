import type { CodexHookEvent, CodexPermissionMode } from "../constants/index.js";

/** Codex Hook 的公共输入字段。 */
export interface CodexHookInputBase {
  /** 当前 Codex Session 标识。 */
  readonly session_id: string;
  /** 当前 Hook 工作目录。 */
  readonly cwd: string;
  /** 当前 Codex Hook 事件名。 */
  readonly hook_event_name: CodexHookEvent;
  /** 当前模型标识。 */
  readonly model: string;
  /** 当前权限模式。 */
  readonly permission_mode: CodexPermissionMode;
  /** 当前 Turn 标识。 */
  readonly turn_id: string;
  /** 可选 Transcript 路径，仅作为外部引用。 */
  readonly transcript_path?: string | null;
}

/** Codex PreToolUse 原始输入。 */
export interface CodexPreToolUseInput extends CodexHookInputBase {
  /** 当前事件固定为 PreToolUse。 */
  readonly hook_event_name: CodexHookEvent.PreToolUse;
  /** Codex 工具名称。 */
  readonly tool_name: string;
  /** 当前工具调用标识。 */
  readonly tool_use_id: string;
  /** 工具参数对象。 */
  readonly tool_input: unknown;
}

/** Codex PostToolUse 原始输入。 */
export interface CodexPostToolUseInput extends CodexHookInputBase {
  /** 当前事件固定为 PostToolUse。 */
  readonly hook_event_name: CodexHookEvent.PostToolUse;
  /** Codex 工具名称。 */
  readonly tool_name: string;
  /** 当前工具调用标识。 */
  readonly tool_use_id: string;
  /** 工具参数对象。 */
  readonly tool_input: unknown;
  /** 工具返回值。 */
  readonly tool_response: unknown;
}

/** Codex Adapter 支持的原始 Hook 输入 union。 */
export type CodexHookInput = CodexPreToolUseInput | CodexPostToolUseInput;
