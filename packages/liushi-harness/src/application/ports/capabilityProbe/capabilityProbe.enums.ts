/** 能力探测结果的封闭状态。 */
export enum CapabilityProbeStatus {
  /** 已通过静态证据验证。 */
  Verified = "verified",
  /** 当前证据不足，不能宣称支持。 */
  Unverified = "unverified",
  /** 已知当前探测路径不可用。 */
  Unavailable = "unavailable",
}

/** Codex 能力探测报告中的封闭能力名称。 */
export enum CodexCapabilityName {
  /** 命令处理器可以被静态发现。 */
  CommandHandler = "command_handler",
  /** PreToolUse 事件可以被静态发现。 */
  PreToolUse = "pre_tool_use",
  /** PostToolUse 事件可以被静态发现。 */
  PostToolUse = "post_tool_use",
  /** 原生 stdin 协议可以被静态发现。 */
  NativeStdin = "native_stdin",
}

/** Codex Capability Probe 使用的静态命令。 */
export enum CodexProbeCommand {
  /** 读取 Codex 版本，不启动模型。 */
  Version = "codex --version",
  /** 读取 Codex 帮助，不启动模型。 */
  Help = "codex --help",
}

/** Capability Probe 当前支持的执行器。 */
export enum CapabilityProbeExecutor {
  /** OpenAI Codex 执行器。 */
  Codex = "codex",
}
