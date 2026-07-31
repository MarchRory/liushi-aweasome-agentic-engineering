import {
  CODEX_MODEL_PROVIDER,
  CODEX_MODEL_PROVIDER_ID,
  REASONING_EFFORT,
} from "../constants/index.js";
import type { CodexAgentArgumentsInput } from "../contracts/index.js";
import { serializeTomlValue } from "../serialization/index.js";
import { appendRestrictedRuntimeOverrides, createConfigArguments } from "../validation/index.js";

/** 返回确定性的受限 Runtime overrides。 */
export function createCodexRuntimeOverrides(): string[] {
  return [...appendRestrictedRuntimeOverrides([])];
}

/** 组装允许 Preflight 注入 provider overrides 的通用 App Server 参数。 */
export function createCodexAppServerArguments(configOverrides: readonly string[]): string[] {
  return [
    ...createConfigArguments(appendRestrictedRuntimeOverrides(configOverrides)),
    "--strict-config",
    "app-server",
    "--stdio",
  ];
}

/** 组装固定生产 Provider 和 reasoning 参数的 App Server 参数。 */
export function createCodexAgentAppServerArguments(): string[] {
  const providerOverride = `model_providers.${CODEX_MODEL_PROVIDER_ID}=${serializeTomlValue(
    CODEX_MODEL_PROVIDER,
  )}`;
  return createCodexAppServerArguments([
    `model_provider=${serializeTomlValue(CODEX_MODEL_PROVIDER_ID)}`,
    providerOverride,
    `model_reasoning_effort=${serializeTomlValue(REASONING_EFFORT)}`,
  ]);
}

/** 保留旧 exec 参数契约，不把 exec 选项混入正式 App Server 契约。 */
export function createCodexAgentArguments(input: CodexAgentArgumentsInput): string[] {
  const configOverrides = [
    ...input.hookDeclarationOverrides,
    input.hookTrustOverride,
    `model_reasoning_effort=${serializeTomlValue(REASONING_EFFORT)}`,
  ];
  return [
    ...createConfigArguments(appendRestrictedRuntimeOverrides(configOverrides)),
    "--strict-config",
    "--ask-for-approval",
    input.approvalPolicy,
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--json",
    "--color",
    "never",
    "-C",
    input.worktreeRoot,
    "--model",
    input.model,
    "--sandbox",
    input.sandbox,
    "-",
  ];
}
