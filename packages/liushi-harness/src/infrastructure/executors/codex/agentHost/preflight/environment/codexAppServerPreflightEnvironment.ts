import process from "node:process";

import {
  CODEX_PREFLIGHT_ENVIRONMENT_ALLOWLIST,
  CODEX_PREFLIGHT_LOOPBACK_NO_PROXY,
  CODEX_PREFLIGHT_PROXY_VARIABLES,
} from "../constants/index.js";
import type { CodexAppServerPreflightEnvironmentInput } from "../contracts/index.js";
import { isCodexPreflightAbsolutePath, splitCodexPreflightHomePath } from "../platform/index.js";

/** 创建不携带凭据的 Codex App Server Preflight 环境。 */
export function createCodexAppServerPreflightEnvironment(
  input: CodexAppServerPreflightEnvironmentInput,
): Readonly<Record<string, string>> {
  requireRecord(input, "Preflight 环境输入");
  assertInputKeys(input);
  if (input.sourceEnvironment !== undefined) {
    requireRecord(input.sourceEnvironment, "sourceEnvironment");
  }
  const sourceEnvironment = input.sourceEnvironment ?? process.env;
  const environment: Record<string, string> = {};

  for (const name of CODEX_PREFLIGHT_ENVIRONMENT_ALLOWLIST) {
    const descriptor = Object.getOwnPropertyDescriptor(sourceEnvironment, name);
    if (descriptor !== undefined && !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`sourceEnvironment.${name} must be a data property`);
    }
    if (descriptor !== undefined) {
      if (descriptor.value !== undefined && typeof descriptor.value !== "string") {
        throw new TypeError(`sourceEnvironment.${name} 必须是字符串或 undefined`);
      }
      if (typeof descriptor.value === "string") environment[name] = descriptor.value;
    }
  }

  const profileHome = requireAbsolutePath(input.profileHome, "profileHome");
  const homeParts = splitCodexPreflightHomePath(profileHome);
  const codexHome = requireAbsolutePath(input.codexHome, "codexHome");
  const sqliteHome = requireAbsolutePath(input.sqliteHome, "sqliteHome");
  const tempHome = requireAbsolutePath(input.tempHome, "tempHome");

  for (const name of CODEX_PREFLIGHT_PROXY_VARIABLES) {
    environment[name] = "";
  }

  return Object.freeze({
    ...environment,
    CODEX_HOME: codexHome,
    CODEX_SQLITE_HOME: sqliteHome,
    HOME: profileHome,
    USERPROFILE: profileHome,
    HOMEDRIVE: homeParts.drive,
    HOMEPATH: homeParts.path,
    TEMP: tempHome,
    TMP: tempHome,
    TMPDIR: tempHome,
    NO_PROXY: CODEX_PREFLIGHT_LOOPBACK_NO_PROXY,
    no_proxy: CODEX_PREFLIGHT_LOOPBACK_NO_PROXY,
    NO_UPDATE_NOTIFIER: "1",
  });
}

/** 兼容旧 Pilot 调用方的环境工厂名称。 */
export const createCodexPreflightEnvironment = createCodexAppServerPreflightEnvironment;

function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain record`);
  }
  const prototype: object | null = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain record`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key === "symbol" ||
      descriptor === undefined ||
      !Object.hasOwn(descriptor, "value")
    ) {
      throw new TypeError(`${label} 只能包含 own data property`);
    }
  }
}

function requireAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !isCodexPreflightAbsolutePath(value)
  ) {
    throw new TypeError(`${label} 必须是无 NUL 的绝对路径`);
  }
  return value;
}

function assertInputKeys(input: Record<string, unknown>): void {
  const actual = Object.keys(input).sort();
  const expected = ["codexHome", "profileHome", "sourceEnvironment", "sqliteHome", "tempHome"];
  const allowedWithoutSource = expected.filter((key) => key !== "sourceEnvironment");
  if (
    ![expected, allowedWithoutSource].some(
      (keys) => keys.length === actual.length && keys.every((key, index) => key === actual[index]),
    )
  ) {
    throw new Error("Preflight 环境输入字段集合无效");
  }
}
