import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { CodexAgentRuntimePlan, CodexAgentRuntimePlanInput } from "../contracts/index.js";
import { CodexAgentCredentialStrategy } from "../enums/index.js";

const RUNTIME_DIRECTORY_NAME = ".liushiHarnessRuntime";
const SHA256_PREFIX = "sha256:";
const SHA256_HEX_LENGTH = 64;
const SAFE_TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const WINDOWS_RESERVED_NAMES = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.[^.]*)?$/i;

/** 创建经过输入约束的 Codex Runtime 计划。 */
export function createCodexAgentRuntimePlan(input: unknown): CodexAgentRuntimePlan {
  const value = requireRecord(input);
  const codexHomeSource = requireAbsolutePath(value["codexHomeSource"], "codexHomeSource");
  const taskId = requireSafeTaskId(value["taskId"]);
  const sourceStateDigest = requireSha256Digest(value["sourceStateDigest"]);
  const runtimeParent = join(dirname(codexHomeSource), RUNTIME_DIRECTORY_NAME, taskId);
  const root = join(runtimeParent, digestHexFromSourceStateDigest(sourceStateDigest));
  const codexHome = join(root, "codexHome");

  return Object.freeze({
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
    credentialStrategy: CodexAgentCredentialStrategy.IsolatedAuthCopy,
  });
}

/** 校验计划中的所有派生路径，返回重新构造的规范计划。 */
export function validateCodexAgentRuntimePlan(plan: unknown): CodexAgentRuntimePlan {
  const value = requireRecord(plan);
  const expected = createCodexAgentRuntimePlan({
    codexHomeSource: value["codexHomeSource"],
    taskId: value["taskId"],
    sourceStateDigest: value["sourceStateDigest"],
  } satisfies Record<keyof CodexAgentRuntimePlanInput, unknown>);

  for (const key of [
    "root",
    "codexHome",
    "sqliteHome",
    "tempHome",
    "profileHome",
    "authSourceFile",
    "authFile",
  ] as const) {
    if (!sameRuntimePath(value[key], expected[key])) {
      throw new Error(`Codex Agent Runtime 计划的 ${key} 不匹配。`);
    }
  }
  if (value["credentialStrategy"] !== expected.credentialStrategy) {
    throw new Error("Codex Agent Runtime 凭据策略无效。");
  }

  return expected;
}

/** 从 SHA-256 源状态摘要提取小写十六进制部分。 */
export function digestHexFromSourceStateDigest(sourceStateDigest: unknown): string {
  return requireSha256Digest(sourceStateDigest).slice(SHA256_PREFIX.length);
}

/** 返回任务专用的 Runtime 父目录。 */
export function runtimeRootParentForPlan(plan: unknown): string {
  return dirname(validateCodexAgentRuntimePlan(plan).root);
}

/** 返回所有 Runtime 共用的专用根目录。 */
export function runtimeDedicatedRootForPlan(plan: unknown): string {
  return dirname(runtimeRootParentForPlan(plan));
}

/** 比较两个路径的规范绝对形式是否指向同一路径。 */
export function sameRuntimePath(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  return relative(resolve(left), resolve(right)) === "";
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Codex Agent Runtime 计划必须是对象。");
  }

  return value as Record<string, unknown>;
}

function requireAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !isAbsolute(value)
  ) {
    throw new TypeError(`${label} 必须是无 NUL 的绝对路径。`);
  }
  if (value.replaceAll("\\", "/").split("/").includes("..")) {
    throw new Error(`${label} 不得包含路径穿越。`);
  }

  return resolve(value);
}

function requireSafeTaskId(value: unknown): string {
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

function requireSha256Digest(value: unknown): string {
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
