import { calculateDigest } from "../../../digest/index.mjs";

const RUNNER_OUTCOME = Object.freeze({
  Succeeded: "succeeded",
  Failed: "failed",
  Denied: "denied",
  Interrupted: "interrupted",
  OutcomeUnknown: "outcome_unknown",
});
const SHA256_HEX = /^[0-9a-f]{64}$/u;

export async function inspectWorktreeChangeSafely(input) {
  try {
    return await input.inspectWorktree({
      worktreeRoot: input.artifacts.worktreeRoot,
      targetFile: input.artifacts.targetFile,
      initialTargetDigest: input.initialTargetDigest ?? input.artifacts.targetDigest,
      runGit: input.dependencies.runGit,
    });
  } catch (error) {
    return {
      inspected: false,
      valid: false,
      reason: "inspection_failed",
      error: serializeError(error),
    };
  }
}

export async function validateRecoveryWorktree(input) {
  if (input.record.outcomeUnknown) return;
  if (input.record.worktreeChange?.inspected !== true) {
    throw new Error("Agent Execution Record 缺少可重放的 Worktree evidence。");
  }
  const current = await input.inspectWorktree({
    worktreeRoot: input.launchState.activation.worktreeRoot,
    targetFile: input.launchState.activation.targetFile,
    initialTargetDigest:
      input.record.launchBaseline?.target?.digest ?? input.launchState.activation.targetDigest,
    runGit: input.dependencies.runGit,
  });
  if (calculateDigest(current) !== calculateDigest(input.record.worktreeChange)) {
    throw new Error("Agent Execution Record 写入后 Worktree 发生漂移。");
  }
}

export function normalizeProcessResult(result) {
  const value = requireRecord(result, "Codex App Server Result");
  const process = normalizeCompletedProcess(value.process);
  if (
    !Object.values(RUNNER_OUTCOME).includes(value.outcome) ||
    value.outcome === RUNNER_OUTCOME.OutcomeUnknown ||
    value.status !== value.outcome
  ) {
    throw new Error("Codex App Server outcome 无效。");
  }
  return {
    outcome: value.outcome,
    process,
    protocolEvidence: requireRecord(value.protocolEvidence, "Codex App Server Protocol Evidence"),
    error: null,
  };
}

export function normalizeProcessError(error) {
  const processMayBeRunning =
    error?.processMayBeRunning === true || error?.processStarted === undefined;
  const processStarted = error?.processStarted !== false;
  return {
    outcome: processMayBeRunning ? RUNNER_OUTCOME.OutcomeUnknown : RUNNER_OUTCOME.Failed,
    process: {
      processStarted,
      processMayBeRunning,
      exitCode: null,
      signal: null,
      timedOut: error?.timedOut === true,
      outputLimitExceeded: error?.outputLimitExceeded === true,
      stderrLimitExceeded: error?.stderrLimitExceeded === true,
      terminationReason:
        typeof error?.terminationReason === "string" ? error.terminationReason : null,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutDigest: null,
      stderrDigest: null,
    },
    protocolEvidence: isRecord(error?.protocolEvidence) ? error.protocolEvidence : null,
    error: serializeError(error),
  };
}

export function createKnownPrelaunchFailure(error) {
  return {
    outcome: RUNNER_OUTCOME.Failed,
    process: {
      processStarted: false,
      processMayBeRunning: false,
      exitCode: null,
      signal: null,
      timedOut: false,
      outputLimitExceeded: false,
      stderrLimitExceeded: false,
      terminationReason: null,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutDigest: null,
      stderrDigest: null,
    },
    protocolEvidence: null,
    error: serializeError(error),
  };
}

export function createUninspectedWorktreeChange(reason) {
  return {
    inspected: false,
    valid: false,
    reason,
  };
}

export function serializeAgentRunError(error) {
  return serializeError(error);
}

function normalizeCompletedProcess(value) {
  const process = requireRecord(value, "Codex App Server Process");
  if (
    process.processStarted !== true ||
    process.processMayBeRunning !== false ||
    process.outcomeUnknown !== false ||
    (process.exitCode !== null && !Number.isInteger(process.exitCode)) ||
    (process.signal !== null && typeof process.signal !== "string") ||
    typeof process.timedOut !== "boolean" ||
    typeof process.outputLimitExceeded !== "boolean" ||
    typeof process.stderrLimitExceeded !== "boolean" ||
    (process.terminationReason !== null && typeof process.terminationReason !== "string") ||
    !Number.isSafeInteger(process.stdoutBytes) ||
    process.stdoutBytes < 0 ||
    !Number.isSafeInteger(process.stderrBytes) ||
    process.stderrBytes < 0 ||
    !SHA256_HEX.test(process.stdoutDigest) ||
    !SHA256_HEX.test(process.stderrDigest)
  ) {
    throw new Error("Codex App Server Process 返回值无效。");
  }
  return {
    processStarted: true,
    processMayBeRunning: false,
    exitCode: process.exitCode,
    signal: process.signal,
    timedOut: process.timedOut,
    outputLimitExceeded: process.outputLimitExceeded,
    stderrLimitExceeded: process.stderrLimitExceeded,
    terminationReason: process.terminationReason,
    stdoutBytes: process.stdoutBytes,
    stderrBytes: process.stderrBytes,
    stdoutDigest: process.stdoutDigest,
    stderrDigest: process.stderrDigest,
  };
}

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    causeMessage:
      error instanceof Error && error.cause !== undefined
        ? error.cause instanceof Error
          ? error.cause.message
          : String(error.cause)
        : null,
  };
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} 缺失或无效。`);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
