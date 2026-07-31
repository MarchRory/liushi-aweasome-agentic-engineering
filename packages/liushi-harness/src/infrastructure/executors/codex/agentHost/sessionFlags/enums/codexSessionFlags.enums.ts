/** Codex 受限 Agent Feature 的闭集。 */
export enum CodexDisabledAgentFeature {
  /** 禁用应用能力。 */
  Apps = "apps",
  /** 禁用 artifact 能力。 */
  Artifact = "artifact",
  /** 禁用认证询问能力。 */
  AuthElicitation = "auth_elicitation",
  /** 禁用浏览器能力。 */
  BrowserUse = "browser_use",
  /** 禁用外部浏览器能力。 */
  BrowserUseExternal = "browser_use_external",
  /** 禁用完整 CDP 浏览器能力。 */
  BrowserUseFullCdpAccess = "browser_use_full_cdp_access",
  /** 禁用 code mode。 */
  CodeMode = "code_mode",
  /** 禁用缓冲式执行。 */
  CodeModeBufferedExec = "code_mode_buffered_exec",
  /** 禁用宿主 code mode。 */
  CodeModeHost = "code_mode_host",
  /** 禁用仅 code mode。 */
  CodeModeOnly = "code_mode_only",
  /** 禁用 computer use。 */
  ComputerUse = "computer_use",
  /** 禁用延迟执行器。 */
  DeferredExecutor = "deferred_executor",
  /** 禁用 MCP 应用。 */
  EnableMcpApps = "enable_mcp_apps",
  /** 禁用执行器能力发现。 */
  ExecutorCapabilityDiscovery = "executor_capability_discovery",
  /** 禁用目标能力。 */
  Goals = "goals",
  /** 禁用图像生成。 */
  ImageGeneration = "image_generation",
  /** 禁用内置浏览器。 */
  InAppBrowser = "in_app_browser",
  /** 禁用记忆能力。 */
  Memories = "memories",
  /** 禁用多 Agent 能力。 */
  MultiAgent = "multi_agent",
  /** 禁用第二版多 Agent 能力。 */
  MultiAgentV2 = "multi_agent_v2",
  /** 禁用插件共享。 */
  PluginSharing = "plugin_sharing",
  /** 禁用插件能力。 */
  Plugins = "plugins",
  /** 禁用远程插件。 */
  RemotePlugin = "remote_plugin",
  /** 禁用权限请求工具。 */
  RequestPermissionsTool = "request_permissions_tool",
  /** 禁用 shell 工具。 */
  ShellTool = "shell_tool",
  /** 禁用 Skill MCP 依赖安装。 */
  SkillMcpDependencyInstall = "skill_mcp_dependency_install",
  /** 禁用 Skill 搜索。 */
  SkillSearch = "skill_search",
  /** 禁用独立 Web 搜索。 */
  StandaloneWebSearch = "standalone_web_search",
  /** 禁用工具 MCP elicitation。 */
  ToolCallMcpElicitation = "tool_call_mcp_elicitation",
  /** 禁用工具建议。 */
  ToolSuggest = "tool_suggest",
  /** 禁用 unified exec。 */
  UnifiedExec = "unified_exec",
  /** 禁用 workspace dependencies。 */
  WorkspaceDependencies = "workspace_dependencies",
}

/** Codex 原生 Hook 事件的闭集。 */
export enum CodexHookEvent {
  /** 工具调用前事件。 */
  PreToolUse = "PreToolUse",
  /** 工具调用后事件。 */
  PostToolUse = "PostToolUse",
}

/** Codex Hook handler 类型的闭集。 */
export enum CodexHookHandlerType {
  /** 命令 handler。 */
  Command = "command",
}

/** Codex Hook matcher 的闭集。 */
export enum CodexHookMatcher {
  /** 仅匹配 apply_patch。 */
  ApplyPatch = "^apply_patch$",
}

/** 正式生产 Provider ID 的闭集。 */
export enum CodexModelProviderId {
  /** 受限 OpenAI Provider。 */
  RestrictedOpenAi = "liushi_restricted_openai",
}

/** Codex reasoning effort 的闭集。 */
export enum CodexReasoningEffort {
  /** 当前正式值。 */
  Medium = "medium",
}

/** Codex Provider wire API 的闭集。 */
export enum CodexWireApi {
  /** Responses 接口。 */
  Responses = "responses",
}
