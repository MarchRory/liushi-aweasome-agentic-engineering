import {
  CODEX_HOOK_EVENTS,
  CODEX_HOOK_FEATURE_OVERRIDE,
  CODEX_MODEL_PROVIDER,
  CODEX_MODEL_PROVIDER_ID,
  CODEX_RESTRICTED_RUNTIME_OVERRIDES,
  REASONING_EFFORT,
} from "../../constants/index.mjs";

const BARE_TOML_KEY = /^[A-Za-z0-9_-]+$/u;
const DOTTED_TOML_KEY = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/u;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RESTRICTED_RUNTIME_KEYS = new Set(
  CODEX_RESTRICTED_RUNTIME_OVERRIDES.map((override) => readConfigOverrideKey(override)),
);

export function createHookDeclarationOverrides(candidateConfig) {
  const hooks = requireRecord(candidateConfig?.hooks, "Candidate hooks");
  const expectedEvents = Object.values(CODEX_HOOK_EVENTS);
  const actualEvents = Object.keys(hooks).sort();
  if (JSON.stringify(actualEvents) !== JSON.stringify([...expectedEvents].sort())) {
    throw new Error("Candidate Hook 事件集合不符合 Pilot 约束。");
  }
  return [
    CODEX_HOOK_FEATURE_OVERRIDE,
    ...expectedEvents.map((event) => {
      const groups = hooks[event];
      validateHookGroups(groups, event);
      return `hooks.${event}=${serializeTomlValue(groups)}`;
    }),
  ];
}

export function createHookTrustOverride(hooks) {
  if (!Array.isArray(hooks) || hooks.length === 0) {
    throw new Error("Hook Trust 必须绑定至少一个 Hook。");
  }
  const state = {};
  for (const hook of [...hooks].sort((left, right) => left.key.localeCompare(right.key))) {
    if (
      typeof hook?.key !== "string" ||
      hook.key.length === 0 ||
      !SHA256_DIGEST.test(hook.currentHash)
    ) {
      throw new Error("Hook Trust key 或 currentHash 无效。");
    }
    if (Object.hasOwn(state, hook.key)) throw new Error("Hook Trust key 不得重复。");
    state[hook.key] = { enabled: true, trusted_hash: hook.currentHash };
  }
  return `hooks.state=${serializeTomlValue(state)}`;
}

export function createCodexRuntimeOverrides() {
  return [...CODEX_RESTRICTED_RUNTIME_OVERRIDES];
}

export function createCodexAppServerArguments(configOverrides) {
  return [
    ...createConfigArguments(appendRestrictedRuntimeOverrides(configOverrides)),
    "--strict-config",
    "app-server",
    "--stdio",
  ];
}

export function createCodexAgentAppServerArguments() {
  const providerOverride = `model_providers.${CODEX_MODEL_PROVIDER_ID}=${serializeTomlValue(
    CODEX_MODEL_PROVIDER,
  )}`;
  return createCodexAppServerArguments([
    `model_provider=${serializeTomlValue(CODEX_MODEL_PROVIDER_ID)}`,
    providerOverride,
    `model_reasoning_effort=${serializeTomlValue(REASONING_EFFORT)}`,
  ]);
}

// 仅保留给旧版 exec 合同测试；生产 Pilot 不再通过该入口启动 Agent。
export function createCodexAgentArguments(input) {
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

export function serializeTomlValue(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeTomlValue(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${serializeTomlKey(key)}=${serializeTomlValue(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("SessionFlags 仅支持确定性的 TOML 标量、数组和对象。");
}

function createConfigArguments(configOverrides) {
  if (!Array.isArray(configOverrides) || configOverrides.length === 0) {
    throw new Error("Codex SessionFlags 不得为空。");
  }
  const keys = new Set();
  return configOverrides.flatMap((override) => {
    const key = readConfigOverrideKey(override);
    if (keys.has(key)) throw new Error(`Codex SessionFlag key 不得重复：${key}`);
    keys.add(key);
    return ["-c", override];
  });
}

function appendRestrictedRuntimeOverrides(configOverrides) {
  if (!Array.isArray(configOverrides)) throw new Error("Codex SessionFlags 必须是数组。");
  for (const override of configOverrides) {
    const key = readConfigOverrideKey(override);
    if (RESTRICTED_RUNTIME_KEYS.has(key)) {
      throw new Error(`Codex 受限 Runtime key 不得由调用方覆盖：${key}`);
    }
  }
  return [...configOverrides, ...createCodexRuntimeOverrides()];
}

function readConfigOverrideKey(override) {
  if (
    typeof override !== "string" ||
    override.length === 0 ||
    override.includes("\0") ||
    !override.includes("=")
  ) {
    throw new Error("Codex SessionFlag 无效。");
  }
  const key = override.slice(0, override.indexOf("=")).trim();
  if (!DOTTED_TOML_KEY.test(key)) throw new Error("Codex SessionFlag key 无效。");
  return key;
}

function validateHookGroups(groups, event) {
  const group = Array.isArray(groups) ? groups[0] : undefined;
  const handler = Array.isArray(group?.hooks) ? group.hooks[0] : undefined;
  if (
    groups?.length !== 1 ||
    group?.matcher !== "^apply_patch$" ||
    group?.hooks?.length !== 1 ||
    handler?.type !== "command" ||
    typeof handler.command !== "string" ||
    typeof handler.commandWindows !== "string" ||
    !Number.isSafeInteger(handler.timeout) ||
    typeof handler.statusMessage !== "string"
  ) {
    throw new Error(`${event} Hook 声明不符合固定 command 约束。`);
  }
}

function serializeTomlKey(key) {
  return BARE_TOML_KEY.test(key) ? key : JSON.stringify(key);
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} 必须是对象。`);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
