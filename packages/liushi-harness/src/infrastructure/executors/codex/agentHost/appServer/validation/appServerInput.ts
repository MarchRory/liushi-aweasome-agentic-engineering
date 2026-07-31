import { CODEX_APP_SERVER_ARGUMENT_TAIL, CODEX_APP_SERVER_DEFAULTS } from "../constants/index.js";
import type {
  CodexAppServerAuthorizeFileChange,
  CodexAppServerConfig,
  CodexAppServerEnvironment,
  CodexAppServerRunnerOverrides,
  CodexAppServerWireRecord,
} from "../contracts/index.js";
import { CODEX_APP_SERVER_FORBIDDEN_ARGUMENTS } from "../enums/index.js";
import { createAbsolutePathSet, normalizeAbsolutePath, pathIdentity } from "../platform/index.js";

/** 校验并规范化 Codex App Server Runner 输入。 */
export function validateCodexAppServerInput(
  input: unknown,
  overrides: CodexAppServerRunnerOverrides = {},
): CodexAppServerConfig {
  const record = requireRecord(input, "app-server input");
  const environmentValue = record["environment"] ?? record["env"];
  const authorizeValue = record["authorizeFileChange"] ?? overrides.authorizeFileChange;
  if (!isEnvironment(environmentValue) || typeof authorizeValue !== "function") {
    throw new TypeError("environment and authorizeFileChange are required");
  }

  const executable = validateExecutable(record["executable"]);
  const launchArguments = validateArguments(record["arguments"]);
  const cwd = normalizeAbsolutePath(requireString(record["cwd"], "cwd"), "cwd");
  const runtimeWorkspaceRoots = normalizePathList(
    record["runtimeWorkspaceRoots"],
    "runtimeWorkspaceRoots",
  );
  const allowedPaths = createAbsolutePathSet(
    record["allowedPaths"] ??
      record["approvedPaths"] ??
      record["approvedAbsolutePaths"] ??
      record["allowedAbsolutePaths"],
    "allowedPaths",
  );

  return {
    executable,
    arguments: launchArguments,
    prompt: requireString(record["prompt"], "prompt"),
    model: requireString(record["model"], "model"),
    modelProvider: requireString(record["modelProvider"], "modelProvider"),
    cwd,
    runtimeWorkspaceRoots,
    allowedPaths,
    environment: environmentValue,
    authorizeFileChange: authorizeValue as CodexAppServerAuthorizeFileChange,
    timeoutMs: positiveInteger(
      record["timeoutMs"] ?? CODEX_APP_SERVER_DEFAULTS.TimeoutMs,
      "timeoutMs",
    ),
    outputLimitBytes: positiveInteger(
      record["outputLimitBytes"] ??
        record["stdoutLimitBytes"] ??
        record["maxOutputBytes"] ??
        record["maxStdoutBytes"] ??
        CODEX_APP_SERVER_DEFAULTS.OutputLimitBytes,
      "outputLimitBytes",
    ),
    stderrLimitBytes: positiveInteger(
      record["stderrLimitBytes"] ??
        record["maxStderrBytes"] ??
        CODEX_APP_SERVER_DEFAULTS.StderrLimitBytes,
      "stderrLimitBytes",
    ),
    terminationConfirmationTimeoutMs: positiveInteger(
      record["terminationConfirmationTimeoutMs"] ??
        CODEX_APP_SERVER_DEFAULTS.TerminationConfirmationTimeoutMs,
      "terminationConfirmationTimeoutMs",
    ),
  };
}

function validateExecutable(value: unknown): string {
  const executable = requireString(value, "executable");
  normalizeAbsolutePath(executable, "executable");
  return executable;
}

function validateArguments(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("arguments must be a non-empty array");
  }
  const values: unknown[] = value;
  for (const [index, rawArgument] of values.entries()) {
    const argument = requireString(rawArgument, `arguments[${index}]`);
    if (argument.trim().length === 0) {
      throw new TypeError(`arguments[${index}] must not be blank`);
    }
    if (isForbiddenArgument(argument)) {
      throw new Error("arguments contain a forbidden bypass flag");
    }
  }

  const tailOffset = values.length - CODEX_APP_SERVER_ARGUMENT_TAIL.length;
  if (
    tailOffset < 0 ||
    !CODEX_APP_SERVER_ARGUMENT_TAIL.every(
      (argument, index) => values[tailOffset + index] === argument,
    )
  ) {
    throw new Error("arguments must end with --strict-config app-server --stdio");
  }
  return values as readonly string[];
}

function isForbiddenArgument(argument: string): boolean {
  return Object.values(CODEX_APP_SERVER_FORBIDDEN_ARGUMENTS).some(
    (forbidden) => argument === String(forbidden) || argument.startsWith(`${String(forbidden)}=`),
  );
}

function normalizePathList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty array`);
  }
  const normalized: string[] = [];
  const identities = new Set<string>();
  for (const entry of value) {
    const path = normalizeAbsolutePath(entry, label);
    const identity = pathIdentity(path);
    if (identities.has(identity)) throw new Error(`${label} must not contain duplicates`);
    identities.add(identity);
    normalized.push(path);
  }
  return normalized;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new TypeError(`${label} must be a non-empty string without NUL`);
  }
  return value;
}

function isEnvironment(value: unknown): value is CodexAppServerEnvironment {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => entry === undefined || typeof entry === "string");
}

function requireRecord(value: unknown, label: string): CodexAppServerWireRecord {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function isRecord(value: unknown): value is CodexAppServerWireRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
