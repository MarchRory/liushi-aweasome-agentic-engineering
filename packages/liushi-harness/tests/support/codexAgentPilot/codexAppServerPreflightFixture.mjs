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
} from "../../../scripts/codexAgentPilot/constants/index.mjs";
import { calculateDigest } from "../../../scripts/codexAgentPilot/digest/index.mjs";
import { CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS } from "../../../scripts/codexAgentPilot/host/agentRunner/appServer/index.mjs";

export function createCodexAppServerPreflightFixture(state) {
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
    codexExecutableDigest: state.identities.codex.digest,
    codexVersion: state.identities.codex.version,
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
    positive: createScenario({
      scenario: CODEX_APP_SERVER_PREFLIGHT_SCENARIO.AllowedUpdate,
      result: CODEX_APP_SERVER_PREFLIGHT_RESULT.Accepted,
      targetChanged: true,
    }),
    negative: createScenario({
      scenario: CODEX_APP_SERVER_PREFLIGHT_SCENARIO.OutOfSetUpdate,
      result: CODEX_APP_SERVER_PREFLIGHT_RESULT.Cancelled,
      targetChanged: false,
    }),
  };
  return { ...body, evidenceDigest: calculateDigest(body) };
}

function createScenario(input) {
  return {
    scenario: input.scenario,
    result: input.result,
    approvalRequestCount: 1,
    localModelRequestCount: 1,
    targetChanged: input.targetChanged,
    processExited: true,
    processMayBeRunning: false,
    threadStatusTransitions: (input.scenario === CODEX_APP_SERVER_PREFLIGHT_SCENARIO.AllowedUpdate
      ? CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS
      : CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.slice(0, 2)
    ).map((transition) =>
      transition.activeFlags === undefined
        ? { type: transition.type }
        : { type: transition.type, activeFlags: [...transition.activeFlags] },
    ),
  };
}
