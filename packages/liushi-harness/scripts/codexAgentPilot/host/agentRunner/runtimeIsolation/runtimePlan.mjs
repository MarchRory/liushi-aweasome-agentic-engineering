import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const RUNTIME_DIRECTORY_NAME = ".liushiHarnessRuntime";
const SHA256_PREFIX = "sha256:";
const SHA256_HEX_LENGTH = 64;
const SAFE_TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const WINDOWS_RESERVED_NAMES = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.[^.]*)?$/i;

export const CODEX_AGENT_CREDENTIAL_STRATEGY = Object.freeze({
  IsolatedAuthCopy: "isolated_auth_copy",
});

export function createCodexAgentRuntimePlan(input) {
  const codexHomeSource = requireAbsolutePath(input?.codexHomeSource, "codexHomeSource");
  const taskId = requireSafeTaskId(input?.taskId);
  const sourceStateDigest = requireSha256Digest(input?.sourceStateDigest);
  const digestHex = sourceStateDigest.slice(SHA256_PREFIX.length);
  const runtimeParent = join(dirname(codexHomeSource), RUNTIME_DIRECTORY_NAME, taskId);
  const root = join(runtimeParent, digestHex);
  const codexHome = join(root, "codexHome");

  return {
    codexHomeSource,
    taskId,
    sourceStateDigest,
    root,
    codexHome,
    sqliteHome: join(root, "sqliteHome"),
    tempHome: join(root, "tempHome"),
    profileHome: join(root, "profileHome"),
    authSourceFile: join(codexHomeSource, "auth.json"),
    authFile: join(codexHome, "auth.json"),
    credentialStrategy: CODEX_AGENT_CREDENTIAL_STRATEGY.IsolatedAuthCopy,
  };
}

export function validateCodexAgentRuntimePlan(plan) {
  if (plan === null || typeof plan !== "object") {
    throw new TypeError("Codex Agent Runtime plan 必须是对象。");
  }

  const expected = createCodexAgentRuntimePlan({
    codexHomeSource: plan.codexHomeSource,
    taskId: plan.taskId,
    sourceStateDigest: plan.sourceStateDigest,
  });

  for (const key of [
    "root",
    "codexHome",
    "sqliteHome",
    "tempHome",
    "profileHome",
    "authSourceFile",
    "authFile",
  ]) {
    if (!sameRuntimePath(plan[key], expected[key])) {
      throw new Error(`Codex Agent Runtime plan 的 ${key} 不匹配。`);
    }
  }
  if (plan.credentialStrategy !== expected.credentialStrategy) {
    throw new Error("Codex Agent Runtime credentialStrategy 无效。");
  }
  return expected;
}

export function digestHexFromSourceStateDigest(sourceStateDigest) {
  return requireSha256Digest(sourceStateDigest).slice(SHA256_PREFIX.length);
}

export function runtimeRootParentForPlan(plan) {
  const validated = validateCodexAgentRuntimePlan(plan);
  return dirname(validated.root);
}

export function runtimeDedicatedRootForPlan(plan) {
  const validated = validateCodexAgentRuntimePlan(plan);
  return dirname(dirname(validated.root));
}

export function sameRuntimePath(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  return relative(resolve(left), resolve(right)) === "";
}

function requireAbsolutePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !isAbsolute(value)
  ) {
    throw new TypeError(`${label} 必须是无 NUL 的绝对路径。`);
  }
  rejectPathTraversal(value, label);
  return resolve(value);
}

function requireSafeTaskId(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    !SAFE_TASK_ID_PATTERN.test(value) ||
    value.endsWith(".") ||
    value.endsWith(" ") ||
    WINDOWS_RESERVED_NAMES.test(value)
  ) {
    throw new TypeError("taskId 必须是安全的单一路径段。");
  }
  return value;
}

function requireSha256Digest(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith(SHA256_PREFIX) ||
    value.length !== SHA256_PREFIX.length + SHA256_HEX_LENGTH ||
    !/^[0-9a-f]{64}$/.test(value.slice(SHA256_PREFIX.length))
  ) {
    throw new TypeError("sourceStateDigest 必须是 sha256:<64 位小写十六进制>。");
  }
  return value;
}

function rejectPathTraversal(value, label) {
  if (value.replaceAll("\\", "/").split("/").includes("..")) {
    throw new Error(`${label} 不得包含路径穿越。`);
  }
}
