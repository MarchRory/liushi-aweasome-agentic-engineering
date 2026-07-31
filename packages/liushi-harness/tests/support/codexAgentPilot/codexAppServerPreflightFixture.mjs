import {
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS,
} from "../../../scripts/codexAgentPilot/host/agentRunner/appServer/index.mjs";
import {
  CODEX_PREFLIGHT_EXPECTED_RESPONSES_REQUEST_COUNT,
  CodexPreflightResult,
  CodexPreflightScenario,
  createCodexAppServerPreflightEvidence,
} from "../../../scripts/codexAgentPilot/host/preflight/index.mjs";

export function createCodexAppServerPreflightFixture(state) {
  return createCodexAppServerPreflightEvidence({
    codexExecutableDigest: state.identities.codex.digest,
    codexVersion: state.identities.codex.version,
    scenarioResults: [
      createScenario({
        scenario: CodexPreflightScenario.AllowedUpdate,
        result: CodexPreflightResult.Accepted,
        outcome: CODEX_APP_SERVER_OUTCOMES.Succeeded,
        targetChanged: true,
      }),
      createScenario({
        scenario: CodexPreflightScenario.OutOfSetUpdate,
        result: CodexPreflightResult.Cancelled,
        outcome: CODEX_APP_SERVER_OUTCOMES.Denied,
        targetChanged: false,
      }),
    ],
  });
}

function createScenario(input) {
  const positive = input.scenario === CodexPreflightScenario.AllowedUpdate;
  const responsesRequestCount = CODEX_PREFLIGHT_EXPECTED_RESPONSES_REQUEST_COUNT[input.scenario];
  return {
    scenario: input.scenario,
    result: input.result,
    outcome: input.outcome,
    approvalRequestCount: 1,
    localModelRequestCount: 1,
    responsesRequestCount,
    completedResponseCount: responsesRequestCount,
    targetChanged: input.targetChanged,
    processExited: true,
    processMayBeRunning: false,
    threadStatusTransitions: (positive
      ? CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS
      : CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.slice(0, 2)
    ).map((transition) =>
      transition.activeFlags === undefined
        ? { type: transition.type }
        : { type: transition.type, activeFlags: [...transition.activeFlags] },
    ),
  };
}
