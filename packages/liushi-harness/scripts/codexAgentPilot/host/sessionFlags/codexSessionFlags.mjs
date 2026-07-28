import {
  CODEX_HOOK_EVENTS,
  CODEX_HOOK_FEATURE_OVERRIDE,
  REASONING_EFFORT,
} from "../../constants/index.mjs";

const BARE_TOML_KEY = /^[A-Za-z0-9_-]+$/u;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;

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

export function createCodexAppServerArguments(configOverrides) {
  return [...createConfigArguments(configOverrides), "--strict-config", "app-server", "--stdio"];
}

export function createCodexAgentArguments(input) {
  const configOverrides = [
    ...input.hookDeclarationOverrides,
    input.hookTrustOverride,
    `model_reasoning_effort=${serializeTomlValue(REASONING_EFFORT)}`,
  ];
  return [
    ...createConfigArguments(configOverrides),
    "--strict-config",
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
    "--ask-for-approval",
    input.approvalPolicy,
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
  return configOverrides.flatMap((override) => {
    if (
      typeof override !== "string" ||
      override.length === 0 ||
      override.includes("\0") ||
      !override.includes("=")
    ) {
      throw new Error("Codex SessionFlag 无效。");
    }
    return ["-c", override];
  });
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
