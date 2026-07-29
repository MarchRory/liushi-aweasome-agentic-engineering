import {
  AGENT_EXECUTION_SCHEMA_VERSION,
  AGENT_EXECUTION_STATUS,
  CODEX_FILE_CHANGE_DECISION,
} from "../../../constants/index.mjs";
import { calculateDigest } from "../../../digest/index.mjs";
import {
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS,
  CODEX_APP_SERVER_TERMINATION_REASONS,
} from "../../../host/agentRunner/appServer/index.mjs";
import {
  RUNTIME_CLEANUP_STATUS,
  RUNTIME_CREDENTIAL_SOURCE_INTEGRITY_STATUS,
} from "../runtime/index.mjs";

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;

export function createCodexAgentExecutionRecord(input) {
  const protocol = analyzeCodexAppServerProtocol(input.execution.protocolEvidence);
  const status = deriveExecutionStatus({
    outcomeUnknown: input.outcomeUnknown,
    runnerOutcome: input.execution.outcome,
    process: input.execution.process,
    protocol,
    runtimeIsolation: input.runtimeIsolation,
    worktreeChange: input.worktreeChange,
  });
  const body = {
    schemaVersion: AGENT_EXECUTION_SCHEMA_VERSION,
    sourceStateDigest: input.sourceStateDigest,
    launchDigest: input.launchDigest,
    packetDigest: input.packetDigest,
    approvalDigest: input.approvalDigest,
    status,
    outcomeUnknown: input.outcomeUnknown === true,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    launchBaseline: input.launchBaseline,
    runnerOutcome: input.execution.outcome,
    process: input.execution.process,
    protocol,
    runtimeIsolation: input.runtimeIsolation,
    error: input.execution.error,
    worktreeChange: input.worktreeChange,
  };
  return { ...body, recordDigest: calculateDigest(body) };
}

export function validateCodexAgentExecutionRecord(record, expected) {
  const { recordDigest, ...body } = requireRecord(record, "Agent Execution Record");
  const protocol = analyzeCodexAppServerProtocol(body.protocol?.evidence);
  const expectedStatus = deriveExecutionStatus({
    outcomeUnknown: body.outcomeUnknown,
    runnerOutcome: body.runnerOutcome,
    process: body.process,
    protocol,
    runtimeIsolation: body.runtimeIsolation,
    worktreeChange: body.worktreeChange,
  });
  validateLaunchBaseline(body.launchBaseline, body.process, body, expected);
  validateRuntimeIsolation(body.runtimeIsolation, body.process, expected);
  if (
    body.schemaVersion !== AGENT_EXECUTION_SCHEMA_VERSION ||
    body.sourceStateDigest !== expected.sourceStateDigest ||
    body.launchDigest !== expected.launchDigest ||
    body.packetDigest !== expected.packetDigest ||
    body.approvalDigest !== expected.approvalDigest ||
    body.status !== expectedStatus ||
    calculateDigest(body.protocol) !== calculateDigest(protocol) ||
    !isCanonicalTimestamp(body.startedAt) ||
    !isCanonicalTimestamp(body.completedAt) ||
    Date.parse(body.completedAt) < Date.parse(body.startedAt) ||
    calculateDigest(body) !== recordDigest
  ) {
    throw new Error("Agent Execution Record 身份或摘要无效。");
  }
  return record;
}

export function analyzeCodexAppServerProtocol(evidence) {
  if (!isRecord(evidence)) return createInvalidProtocol();
  const authorizations = Array.isArray(evidence.authorizations)
    ? evidence.authorizations.map(normalizeAuthorization)
    : [];
  const normalized = {
    threadId: normalizeIdentifier(evidence.threadId),
    turnId: normalizeIdentifier(evidence.turnId),
    eventCount: normalizeCount(evidence.eventCount),
    responseCount: normalizeCount(evidence.responseCount),
    requestCount: normalizeCount(evidence.requestCount),
    notificationCount: normalizeCount(evidence.notificationCount),
    methodCounts: normalizeMethodCounts(evidence.methodCounts),
    unknownMethodCount: normalizeCount(evidence.unknownMethodCount),
    itemCount: normalizeCount(evidence.itemCount),
    fileChangeItemCount: normalizeCount(evidence.fileChangeItemCount),
    completedFileChangeCount: normalizeCount(evidence.completedFileChangeCount),
    approvedCount: normalizeCount(evidence.approvedCount),
    cancelledCount: normalizeCount(evidence.cancelledCount),
    authorizations,
    threadStatusTransitions: normalizeThreadStatusTransitions(evidence.threadStatusTransitions),
    changeDigest: SHA256_HEX.test(evidence.changeDigest) ? evidence.changeDigest : null,
  };
  const valid =
    normalized.threadId !== null &&
    normalized.turnId !== null &&
    normalized.eventCount > 0 &&
    normalized.responseCount === 3 &&
    normalized.requestCount === 1 &&
    normalized.unknownMethodCount === 0 &&
    normalized.fileChangeItemCount === 1 &&
    normalized.completedFileChangeCount === 1 &&
    normalized.approvedCount === 1 &&
    normalized.cancelledCount === 0 &&
    normalized.authorizations.length === 1 &&
    normalized.authorizations[0].decision === CODEX_FILE_CHANGE_DECISION.Accept &&
    normalized.authorizations[0].valid &&
    JSON.stringify(normalized.threadStatusTransitions) ===
      JSON.stringify(CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS) &&
    normalized.changeDigest !== null;
  return {
    evidence: normalized,
    valid,
  };
}

function createInvalidProtocol() {
  return {
    evidence: null,
    valid: false,
  };
}

function normalizeAuthorization(value) {
  const itemId = normalizeIdentifier(value?.itemId);
  const decision =
    value?.decision === CODEX_FILE_CHANGE_DECISION.Accept ||
    value?.decision === CODEX_FILE_CHANGE_DECISION.Cancel
      ? value.decision
      : null;
  const evidenceDigest = SHA256_DIGEST.test(value?.evidenceDigest) ? value.evidenceDigest : null;
  return {
    itemId,
    decision,
    evidenceDigest,
    valid: itemId !== null && decision !== null && evidenceDigest !== null,
  };
}

function deriveExecutionStatus(input) {
  validateProcessRecord(input.process);
  const worktreeChange = requireRecord(input.worktreeChange, "Agent Worktree Change");
  if (typeof worktreeChange.valid !== "boolean") {
    throw new Error("Agent Worktree Change valid 无效。");
  }
  if (typeof input.outcomeUnknown !== "boolean") {
    throw new Error("Agent Execution outcomeUnknown 无效。");
  }
  if (input.outcomeUnknown) return AGENT_EXECUTION_STATUS.OutcomeUnknown;
  const passed =
    input.runnerOutcome === CODEX_APP_SERVER_OUTCOMES.Succeeded &&
    input.process.processStarted === true &&
    input.process.processMayBeRunning === false &&
    input.process.exitCode === 0 &&
    input.process.signal === null &&
    input.process.timedOut === false &&
    input.process.outputLimitExceeded === false &&
    input.process.stderrLimitExceeded === false &&
    input.protocol.valid &&
    input.runtimeIsolation?.credentialSourceIntegrity?.status ===
      RUNTIME_CREDENTIAL_SOURCE_INTEGRITY_STATUS.Verified &&
    input.runtimeIsolation?.cleanup?.status === RUNTIME_CLEANUP_STATUS.Removed &&
    input.runtimeIsolation?.cleanup?.removed === true &&
    worktreeChange.valid;
  return passed ? AGENT_EXECUTION_STATUS.Passed : AGENT_EXECUTION_STATUS.Failed;
}

function validateRuntimeIsolation(value, process, expected) {
  const runtime = requireRecord(value, "Agent Runtime Isolation");
  const credentialSourceIntegrity = requireRecord(
    runtime.credentialSourceIntegrity,
    "Agent Runtime Credential Source Integrity",
  );
  const cleanup = requireRecord(runtime.cleanup, "Agent Runtime Cleanup");
  if (
    runtime.planDigest !== expected.runtimePlanDigest ||
    runtime.root !== expected.runtimeRoot ||
    runtime.environmentPolicyDigest !== expected.environmentPolicyDigest ||
    typeof runtime.prepared !== "boolean" ||
    !Object.values(RUNTIME_CREDENTIAL_SOURCE_INTEGRITY_STATUS).includes(
      credentialSourceIntegrity.status,
    ) ||
    typeof credentialSourceIntegrity.checked !== "boolean" ||
    (credentialSourceIntegrity.error !== null && !isRecord(credentialSourceIntegrity.error)) ||
    !Object.values(RUNTIME_CLEANUP_STATUS).includes(cleanup.status) ||
    typeof cleanup.attempted !== "boolean" ||
    typeof cleanup.removed !== "boolean" ||
    typeof cleanup.preserved !== "boolean" ||
    (cleanup.error !== null && !isRecord(cleanup.error))
  ) {
    throw new Error("Agent Runtime Isolation 记录无效。");
  }
  if (process.processMayBeRunning) {
    if (
      credentialSourceIntegrity.status !==
        RUNTIME_CREDENTIAL_SOURCE_INTEGRITY_STATUS.PreservedUnknownProcess ||
      credentialSourceIntegrity.checked ||
      cleanup.status !== RUNTIME_CLEANUP_STATUS.PreservedUnknownProcess ||
      cleanup.attempted ||
      !cleanup.preserved
    ) {
      throw new Error("未知进程结果必须保留隔离运行时。");
    }
    return;
  }
  if (
    runtime.prepared &&
    credentialSourceIntegrity.status !== RUNTIME_CREDENTIAL_SOURCE_INTEGRITY_STATUS.Verified &&
    credentialSourceIntegrity.status !== RUNTIME_CREDENTIAL_SOURCE_INTEGRITY_STATUS.Failed
  ) {
    throw new Error("已退出进程的宿主凭据源必须完成完整性校验。");
  }
  if (
    runtime.prepared &&
    cleanup.status !== RUNTIME_CLEANUP_STATUS.Removed &&
    cleanup.status !== RUNTIME_CLEANUP_STATUS.Failed
  ) {
    throw new Error("已退出进程的隔离运行时必须完成或记录清理失败。");
  }
}

function validateLaunchBaseline(value, process, timestamps, expected) {
  if (value === null) {
    if (process.processStarted) {
      throw new Error("已启动的 Agent 缺少 launch baseline。");
    }
    return;
  }
  const baseline = requireRecord(value, "Agent Launch Baseline");
  const target = requireRecord(baseline.target, "Agent Launch Baseline target");
  const worktree = requireRecord(baseline.worktreeIdentity, "Agent Launch Baseline worktree");
  if (
    !isCanonicalTimestamp(baseline.capturedAt) ||
    Date.parse(baseline.capturedAt) < Date.parse(timestamps.startedAt) ||
    Date.parse(baseline.capturedAt) > Date.parse(timestamps.completedAt) ||
    target.file !== expected.targetFile ||
    target.digest !== expected.targetDigest ||
    !Number.isSafeInteger(target.size) ||
    target.size < 0 ||
    typeof target.modifiedAtMs !== "number" ||
    !Number.isFinite(target.modifiedAtMs) ||
    worktree.root !== expected.worktreeRoot ||
    worktree.revision !== expected.repositoryRevision ||
    worktree.clean !== true
  ) {
    throw new Error("Agent Launch Baseline 身份或时间边界无效。");
  }
}

function validateProcessRecord(value) {
  const process = requireRecord(value, "Codex App Server Process");
  if (
    typeof process.processStarted !== "boolean" ||
    typeof process.processMayBeRunning !== "boolean" ||
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
    (process.stdoutDigest !== null && !SHA256_HEX.test(process.stdoutDigest)) ||
    (process.stderrDigest !== null && !SHA256_HEX.test(process.stderrDigest)) ||
    process.timedOut !==
      (process.terminationReason === CODEX_APP_SERVER_TERMINATION_REASONS.Timeout) ||
    process.outputLimitExceeded !==
      (process.terminationReason === CODEX_APP_SERVER_TERMINATION_REASONS.OutputLimit) ||
    process.stderrLimitExceeded !==
      (process.terminationReason === CODEX_APP_SERVER_TERMINATION_REASONS.StderrLimit)
  ) {
    throw new Error("Codex App Server Process 记录无效。");
  }
}

function normalizeMethodCounts(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([method, count]) =>
          typeof method === "string" &&
          method.length > 0 &&
          Number.isSafeInteger(count) &&
          count >= 0,
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeThreadStatusTransitions(value) {
  if (!Array.isArray(value)) return null;
  const normalized = [];
  for (const transition of value) {
    if (!isRecord(transition) || typeof transition.type !== "string") return null;
    if (transition.activeFlags === undefined) {
      normalized.push({ type: transition.type });
      continue;
    }
    if (
      !Array.isArray(transition.activeFlags) ||
      transition.activeFlags.some((flag) => typeof flag !== "string")
    ) {
      return null;
    }
    normalized.push({ type: transition.type, activeFlags: [...transition.activeFlags] });
  }
  return normalized;
}

function normalizeIdentifier(value) {
  return typeof value === "string" && value.length > 0 && !value.includes("\0") ? value : null;
}

function normalizeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : -1;
}

function isCanonicalTimestamp(value) {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} 缺失或无效。`);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
