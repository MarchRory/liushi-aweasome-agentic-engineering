import { posix, win32 } from "node:path";

import {
  CODEX_HOOK_EVENT_METADATA,
  CODEX_HOOK_EVENTS,
  CODEX_HOOK_SOURCE,
} from "../../constants/index.mjs";

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SESSION_FLAGS_SOURCE_PATH = /[/\\]<session-flags>[/\\]config\.toml$/u;

export function validateCodexHookProbe(input) {
  const initialize = requireRecord(input.probe?.initializeResult, "initialize result");
  const response = requireRecord(input.probe?.hooksListResponse, "hooks/list response");
  const platformFamily = requireString(initialize.platformFamily, "platformFamily");
  if (!["unix", "windows"].includes(platformFamily)) {
    throw new Error("Codex app-server platformFamily 不受支持。");
  }
  if (
    normalizePath(initialize.codexHome, platformFamily) !==
    normalizePath(input.codexHome, platformFamily)
  ) {
    throw new Error("Codex app-server 未使用隔离 CODEX_HOME。");
  }
  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new Error("hooks/list 必须只返回一个 CWD 结果。");
  }
  const entry = requireRecord(response.data[0], "hooks/list entry");
  if (
    normalizePath(entry.cwd, platformFamily) !== normalizePath(input.cwd, platformFamily) ||
    !Array.isArray(entry.warnings) ||
    entry.warnings.length !== 0 ||
    !Array.isArray(entry.errors) ||
    entry.errors.length !== 0
  ) {
    throw new Error("hooks/list CWD、warning 或 error 不符合预期。");
  }
  if (!Array.isArray(entry.hooks) || entry.hooks.length !== 2) {
    throw new Error("Pilot 必须只激活两个 SessionFlags Hook。");
  }

  const candidateHooks = requireRecord(input.candidateConfig?.hooks, "Candidate hooks");
  return Object.values(CODEX_HOOK_EVENTS).map((event) => {
    const metadata = CODEX_HOOK_EVENT_METADATA[event];
    const group = candidateHooks[event]?.[0];
    const handler = group?.hooks?.[0];
    const hook = entry.hooks.find((item) => item?.eventName === metadata.eventName);
    validateHook({
      hook,
      group,
      handler,
      metadata,
      platformFamily,
      expectedTrustStatus: input.expectedTrustStatus,
    });
    return projectHookEvidence(hook);
  });
}

export function validateStableHookIdentity(untrustedHooks, trustedHooks) {
  if (untrustedHooks.length !== trustedHooks.length) {
    throw new Error("Hook Trust 预检前后的 Hook 数量发生漂移。");
  }
  for (let index = 0; index < untrustedHooks.length; index += 1) {
    const { trustStatus: beforeTrust, ...before } = untrustedHooks[index];
    const { trustStatus: afterTrust, ...after } = trustedHooks[index];
    void beforeTrust;
    void afterTrust;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error("Hook Trust 预检前后的 Hook identity 发生漂移。");
    }
  }
}

function validateHook(input) {
  const hook = requireRecord(input.hook, `${input.metadata.eventName} Hook`);
  const expectedCommand =
    input.platformFamily === "windows"
      ? (input.handler?.commandWindows ?? input.handler?.command)
      : input.handler?.command;
  if (
    hook.handlerType !== "command" ||
    hook.matcher !== input.group?.matcher ||
    hook.command !== expectedCommand ||
    hook.timeoutSec !== input.handler?.timeout ||
    hook.statusMessage !== input.handler?.statusMessage ||
    hook.additionalContextLimit !== null ||
    hook.source !== CODEX_HOOK_SOURCE ||
    hook.pluginId !== null ||
    hook.enabled !== true ||
    hook.isManaged !== false ||
    hook.trustStatus !== input.expectedTrustStatus ||
    !Number.isSafeInteger(hook.displayOrder) ||
    !SHA256_DIGEST.test(hook.currentHash) ||
    typeof hook.sourcePath !== "string" ||
    !SESSION_FLAGS_SOURCE_PATH.test(hook.sourcePath) ||
    hook.key !== `${hook.sourcePath}:${input.metadata.keySuffix}`
  ) {
    throw new Error(`${input.metadata.eventName} Hook metadata 未精确绑定 SessionFlags。`);
  }
}

function projectHookEvidence(hook) {
  return {
    key: hook.key,
    eventName: hook.eventName,
    handlerType: hook.handlerType,
    matcher: hook.matcher,
    command: hook.command,
    timeoutSec: hook.timeoutSec,
    statusMessage: hook.statusMessage,
    additionalContextLimit: hook.additionalContextLimit,
    sourcePath: hook.sourcePath,
    source: hook.source,
    pluginId: hook.pluginId,
    displayOrder: hook.displayOrder,
    enabled: hook.enabled,
    isManaged: hook.isManaged,
    currentHash: hook.currentHash,
    trustStatus: hook.trustStatus,
  };
}

function normalizePath(value, platformFamily) {
  const pathApi = platformFamily === "windows" ? win32 : posix;
  const normalized = pathApi.resolve(requireString(value, "路径"));
  return platformFamily === "windows" ? normalized.toLowerCase() : normalized;
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}
