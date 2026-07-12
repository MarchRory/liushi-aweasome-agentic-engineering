import type { CodexHookEvent } from "../../constants/index.js";

/** Codex 当前支持的 Hook handler 类型。 */
export enum CodexHookHandlerType {
  /** 由命令行进程处理 Hook。 */
  Command = "command",
}

/** 单个 Codex command Hook handler。 */
export interface CodexHookCommandHandler {
  /** handler 类型，当前固定为 command。 */
  readonly type: CodexHookHandlerType.Command;
  /** 非 Windows 环境执行的命令。 */
  readonly command: string;
  /** Windows 环境执行的命令。 */
  readonly commandWindows: string;
  /** Codex UI 中显示的状态文本。 */
  readonly statusMessage: string;
}

/** Codex 按 matcher 分组的 Hook 配置。 */
export interface CodexHookMatcherGroup {
  /** 匹配 Codex tool_name 的正则表达式。 */
  readonly matcher: string;
  /** 当前 matcher 下按顺序声明的 handlers。 */
  readonly hooks: readonly CodexHookCommandHandler[];
}

/** 可被 Codex 直接读取的 hooks.json 投影。 */
export interface CodexHookProjection extends Readonly<Record<string, unknown>> {
  /** Codex Hook 事件到 matcher 分组的映射。 */
  readonly hooks: Readonly<Record<CodexHookEvent, readonly CodexHookMatcherGroup[]>>;
}

/** 生成 hooks.json 时允许覆盖的命令参数。 */
export interface CodexHookProjectionOptions {
  /** 非 Windows 环境的 Wrapper 命令。 */
  readonly command?: string;
  /** Windows 环境的 Wrapper 命令。 */
  readonly commandWindows?: string;
  /** 工具 matcher，默认只接管 apply_patch。 */
  readonly matcher?: string;
  /** PreToolUse 状态文本。 */
  readonly preStatusMessage?: string;
  /** PostToolUse 状态文本。 */
  readonly postStatusMessage?: string;
}
