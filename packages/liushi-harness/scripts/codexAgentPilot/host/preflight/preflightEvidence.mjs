import {
  CODEX_AGENT_EXECUTION_MODE,
  CODEX_APP_SERVER_PREFLIGHT_RESULT,
  CODEX_APP_SERVER_PREFLIGHT_SCENARIO,
  CODEX_APP_SERVER_PREFLIGHT_SCHEMA_VERSION,
  CODEX_MODEL_PROVIDER_ID,
  CODEX_NATIVE_HOOK_BOUNDARY_BASIS,
  CODEX_NATIVE_HOOK_CONTROL_ROLE,
  CODEX_NATIVE_HOOK_CURRENT_PROBE_STATUS,
  CODEX_NATIVE_HOOK_ISSUE_URL,
  CODEX_NATIVE_HOOK_STATUS,
  HOST_PREFLIGHT_PROCESS_COUNT,
  HOST_PREFLIGHT_REAL_MODEL_REQUEST_COUNT,
} from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import { CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS } from "../agentRunner/appServer/index.mjs";

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;

export function createCodexAppServerPreflightEvidence(input) {
  const positive = requireScenarioResult(
    input?.scenarioResults,
    CODEX_APP_SERVER_PREFLIGHT_SCENARIO.AllowedUpdate,
  );
  const negative = requireScenarioResult(
    input?.scenarioResults,
    CODEX_APP_SERVER_PREFLIGHT_SCENARIO.OutOfSetUpdate,
  );
  const nativeHookBody = {
    status: CODEX_NATIVE_HOOK_STATUS.Unavailable,
    issueUrl: CODEX_NATIVE_HOOK_ISSUE_URL,
    controlRole: CODEX_NATIVE_HOOK_CONTROL_ROLE.None,
    basis: CODEX_NATIVE_HOOK_BOUNDARY_BASIS.PinnedVersionAndIssue,
    currentPreflight: {
      status: CODEX_NATIVE_HOOK_CURRENT_PROBE_STATUS.NotRun,
      processCount: 0,
    },
  };
  const nativeHookEvidence = {
    ...nativeHookBody,
    evidenceDigest: calculateDigest(nativeHookBody),
  };
  const body = {
    schemaVersion: CODEX_APP_SERVER_PREFLIGHT_SCHEMA_VERSION,
    codexExecutableDigest: requireDigest(input.codexExecutableDigest),
    codexVersion: input.codexVersion,
    executionMode: CODEX_AGENT_EXECUTION_MODE.AppServerFileChangeApproval,
    processCount: HOST_PREFLIGHT_PROCESS_COUNT,
    realModelRequests: HOST_PREFLIGHT_REAL_MODEL_REQUEST_COUNT,
    transport: {
      providerId: CODEX_MODEL_PROVIDER_ID,
      supportsWebsockets: false,
      websocketAttempts: 0,
      reconnectAttempts: 0,
    },
    nativeHookEvidence,
    positive,
    negative,
  };
  return { ...body, evidenceDigest: calculateDigest(body) };
}

export function validateCodexAppServerPreflightEvidence(value, input) {
  const evidence = requireRecord(value, "Codex App Server Preflight Evidence");
  const { evidenceDigest, ...body } = evidence;
  const nativeHookEvidence = requireRecord(body.nativeHookEvidence, "Native Hook Probe Evidence");
  const { evidenceDigest: nativeHookDigest, ...nativeHookBody } = nativeHookEvidence;
  if (
    body.schemaVersion !== CODEX_APP_SERVER_PREFLIGHT_SCHEMA_VERSION ||
    body.codexExecutableDigest !== input.codexExecutableDigest ||
    body.codexVersion !== input.codexVersion ||
    body.executionMode !== CODEX_AGENT_EXECUTION_MODE.AppServerFileChangeApproval ||
    body.processCount !== HOST_PREFLIGHT_PROCESS_COUNT ||
    body.realModelRequests !== HOST_PREFLIGHT_REAL_MODEL_REQUEST_COUNT ||
    body.transport?.providerId !== CODEX_MODEL_PROVIDER_ID ||
    body.transport?.supportsWebsockets !== false ||
    body.transport?.websocketAttempts !== 0 ||
    body.transport?.reconnectAttempts !== 0 ||
    nativeHookBody.status !== CODEX_NATIVE_HOOK_STATUS.Unavailable ||
    nativeHookBody.issueUrl !== CODEX_NATIVE_HOOK_ISSUE_URL ||
    nativeHookBody.controlRole !== CODEX_NATIVE_HOOK_CONTROL_ROLE.None ||
    nativeHookBody.basis !== CODEX_NATIVE_HOOK_BOUNDARY_BASIS.PinnedVersionAndIssue ||
    nativeHookBody.currentPreflight?.status !== CODEX_NATIVE_HOOK_CURRENT_PROBE_STATUS.NotRun ||
    nativeHookBody.currentPreflight?.processCount !== 0 ||
    calculateDigest(nativeHookBody) !== nativeHookDigest ||
    !isScenario(
      body.positive,
      CODEX_APP_SERVER_PREFLIGHT_SCENARIO.AllowedUpdate,
      CODEX_APP_SERVER_PREFLIGHT_RESULT.Accepted,
      true,
    ) ||
    !isScenario(
      body.negative,
      CODEX_APP_SERVER_PREFLIGHT_SCENARIO.OutOfSetUpdate,
      CODEX_APP_SERVER_PREFLIGHT_RESULT.Cancelled,
      false,
    ) ||
    calculateDigest(body) !== evidenceDigest
  ) {
    throw new Error("Codex App Server Preflight Evidence is invalid");
  }
  return evidence;
}

function requireScenarioResult(results, scenario) {
  if (!Array.isArray(results)) throw new TypeError("preflight scenario results are required");
  const result = results.find((item) => item?.scenario === scenario);
  if (result === undefined) throw new Error(`preflight scenario result is missing: ${scenario}`);
  return result;
}

function isScenario(value, scenario, result, targetChanged) {
  const expectedTransitions =
    scenario === CODEX_APP_SERVER_PREFLIGHT_SCENARIO.AllowedUpdate
      ? CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS
      : CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.slice(0, 2);
  return (
    value?.scenario === scenario &&
    value?.result === result &&
    value?.approvalRequestCount === 1 &&
    value?.localModelRequestCount === 1 &&
    value?.targetChanged === targetChanged &&
    value?.processExited === true &&
    value?.processMayBeRunning === false &&
    JSON.stringify(value?.threadStatusTransitions) === JSON.stringify(expectedTransitions)
  );
}

function requireDigest(value) {
  if (!SHA256_DIGEST.test(value)) throw new TypeError("codexExecutableDigest is invalid");
  return value;
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}
