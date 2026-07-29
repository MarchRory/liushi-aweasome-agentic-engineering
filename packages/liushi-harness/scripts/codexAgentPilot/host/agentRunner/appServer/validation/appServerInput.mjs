import {
  CODEX_APP_SERVER_ARGUMENT_TAIL,
  CODEX_APP_SERVER_DEFAULTS,
  CODEX_APP_SERVER_FORBIDDEN_ARGUMENTS,
} from "../codexAppServerConstants.mjs";
import { createAbsolutePathSet, normalizeAbsolutePath, pathIdentity } from "../platform/index.mjs";

export function validateCodexAppServerInput(input, overrides = {}) {
  if (!isRecord(input)) throw new TypeError("app-server input must be an object");

  const environment = input.environment ?? input.env;
  const authorizeFileChange = input.authorizeFileChange ?? overrides.authorizeFileChange;
  if (!isRecord(environment) || typeof authorizeFileChange !== "function") {
    throw new TypeError("environment and authorizeFileChange are required");
  }

  const executable = validateExecutable(input.executable);
  const launchArguments = validateArguments(input.arguments);

  const cwd = normalizeAbsolutePath(requireString(input.cwd, "cwd"), "cwd");
  const runtimeWorkspaceRoots = normalizePathList(
    input.runtimeWorkspaceRoots,
    "runtimeWorkspaceRoots",
  );
  const allowedPaths = createAbsolutePathSet(
    input.allowedPaths ??
      input.approvedPaths ??
      input.approvedAbsolutePaths ??
      input.allowedAbsolutePaths,
    "allowedPaths",
  );

  return {
    executable,
    arguments: launchArguments,
    prompt: requireString(input.prompt, "prompt"),
    model: requireString(input.model, "model"),
    modelProvider: requireString(input.modelProvider, "modelProvider"),
    cwd,
    runtimeWorkspaceRoots,
    allowedPaths,
    environment,
    authorizeFileChange,
    timeoutMs: positiveInteger(input.timeoutMs ?? CODEX_APP_SERVER_DEFAULTS.TimeoutMs, "timeoutMs"),
    outputLimitBytes: positiveInteger(
      input.outputLimitBytes ??
        input.stdoutLimitBytes ??
        input.maxOutputBytes ??
        input.maxStdoutBytes ??
        CODEX_APP_SERVER_DEFAULTS.OutputLimitBytes,
      "outputLimitBytes",
    ),
    stderrLimitBytes: positiveInteger(
      input.stderrLimitBytes ?? input.maxStderrBytes ?? CODEX_APP_SERVER_DEFAULTS.StderrLimitBytes,
      "stderrLimitBytes",
    ),
    terminationConfirmationTimeoutMs: positiveInteger(
      input.terminationConfirmationTimeoutMs ??
        CODEX_APP_SERVER_DEFAULTS.TerminationConfirmationTimeoutMs,
      "terminationConfirmationTimeoutMs",
    ),
  };
}

function validateExecutable(value) {
  const executable = requireString(value, "executable");
  normalizeAbsolutePath(executable, "executable");
  return executable;
}

function validateArguments(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("arguments must be a non-empty array");
  }
  for (const [index, argument] of value.entries()) {
    requireString(argument, `arguments[${index}]`);
    if (argument.trim().length === 0) {
      throw new TypeError(`arguments[${index}] must not be blank`);
    }
    if (isForbiddenArgument(argument)) {
      throw new Error("arguments contain a forbidden bypass flag");
    }
  }

  const tailOffset = value.length - CODEX_APP_SERVER_ARGUMENT_TAIL.length;
  if (
    tailOffset < 0 ||
    !CODEX_APP_SERVER_ARGUMENT_TAIL.every(
      (argument, index) => value[tailOffset + index] === argument,
    )
  ) {
    throw new Error("arguments must end with --strict-config app-server --stdio");
  }
  return value;
}

function isForbiddenArgument(argument) {
  return Object.values(CODEX_APP_SERVER_FORBIDDEN_ARGUMENTS).some(
    (forbidden) => argument === forbidden || argument.startsWith(`${forbidden}=`),
  );
}

function normalizePathList(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty array`);
  }
  const normalized = [];
  const identities = new Set();
  for (const entry of value) {
    const path = normalizeAbsolutePath(entry, label);
    const identity = pathIdentity(path);
    if (identities.has(identity)) throw new Error(`${label} must not contain duplicates`);
    identities.add(identity);
    normalized.push(path);
  }
  return normalized;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new TypeError(`${label} must be a non-empty string without NUL`);
  }
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
