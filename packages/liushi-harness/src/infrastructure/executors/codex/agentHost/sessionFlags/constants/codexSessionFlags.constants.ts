import type { CodexModelProviderConfig } from "../contracts/index.js";
import {
  CodexDisabledAgentFeature,
  CodexHookEvent,
  CodexModelProviderId,
  CodexReasoningEffort,
  CodexWireApi,
} from "../enums/index.js";

/** Codex Hook 功能开关的固定 CLI override。 */
export const CODEX_HOOK_FEATURE_OVERRIDE = "features.hooks=true";

/** 兼容公开 API 的 Hook 事件对象，值从 enum 派生。 */
export const CODEX_HOOK_EVENTS = Object.freeze({
  PreToolUse: CodexHookEvent.PreToolUse,
  PostToolUse: CodexHookEvent.PostToolUse,
});

/** 兼容公开 API 的生产 Provider ID。 */
export const CODEX_MODEL_PROVIDER_ID = CodexModelProviderId.RestrictedOpenAi;

/** 兼容公开 API 的固定生产 Provider 参数。 */
export const CODEX_MODEL_PROVIDER: Readonly<CodexModelProviderConfig> = Object.freeze({
  name: "OpenAI",
  wire_api: CodexWireApi.Responses,
  requires_openai_auth: true,
  supports_websockets: false,
});

/** 兼容公开 API 的固定 reasoning effort。 */
export const REASONING_EFFORT = CodexReasoningEffort.Medium;

/** 按 enum 声明顺序导出的兼容禁用 Feature 数组。 */
export const CODEX_DISABLED_AGENT_FEATURES: readonly string[] = Object.freeze(
  Object.values(CodexDisabledAgentFeature),
);

/** 受限 Runtime overrides，调用方不能覆盖这些 key。 */
export const CODEX_RESTRICTED_RUNTIME_OVERRIDES: readonly string[] = Object.freeze([
  ...CODEX_DISABLED_AGENT_FEATURES.map((feature) => `features.${feature}=false`),
  'web_search="disabled"',
  "project_doc_max_bytes=0",
  'cli_auth_credentials_store="file"',
]);
