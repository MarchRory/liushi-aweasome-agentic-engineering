import type {
  CodexAppServerPreflightEvidenceInput,
  CodexAppServerPreflightScenarioEvidence,
  CodexPreflightResponsesServerHandle,
  CodexPreflightScenarioWorkspace,
  CodexPreflightTemporaryRootDescriptor,
} from "../../../src/infrastructure/executors/codex/agentHost/preflight/index.js";
import {
  CODEX_APP_SERVER_APPROVAL_DECISIONS,
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS,
  type CodexAppServerThreadStatusTransition,
  type CodexAppServerRunnerResult,
} from "../../../src/infrastructure/executors/codex/agentHost/appServer/index.js";
import {
  CODEX_APP_SERVER_PREFLIGHT_COMPLETED_RESPONSE_COUNTS,
  CODEX_APP_SERVER_PREFLIGHT_RESPONSES_REQUEST_COUNTS,
} from "../../../src/infrastructure/executors/codex/agentHost/preflight/index.js";
import {
  CodexPreflightResult,
  CodexPreflightScenario,
} from "../../../src/infrastructure/executors/codex/agentHost/preflight/index.js";

export const CODEX_EXECUTABLE = "C:\\fixed\\codex.exe";
export const CODEX_DIGEST = `sha256:${"a".repeat(64)}`;
export const CODEX_VERSION = "codex-cli 0.145.0";

export function createScenarioEvidence(
  scenario: CodexPreflightScenario,
  overrides: Partial<CodexAppServerPreflightScenarioEvidence> = {},
): CodexAppServerPreflightScenarioEvidence {
  const positive = scenario === CodexPreflightScenario.AllowedUpdate;
  return {
    scenario,
    result: positive ? CodexPreflightResult.Accepted : CodexPreflightResult.Cancelled,
    outcome: positive ? CODEX_APP_SERVER_OUTCOMES.Succeeded : CODEX_APP_SERVER_OUTCOMES.Denied,
    approvalRequestCount: 1,
    localModelRequestCount: 1,
    responsesRequestCount: CODEX_APP_SERVER_PREFLIGHT_RESPONSES_REQUEST_COUNTS[scenario],
    completedResponseCount: CODEX_APP_SERVER_PREFLIGHT_COMPLETED_RESPONSE_COUNTS[scenario],
    targetChanged: positive,
    processExited: true,
    processMayBeRunning: false,
    threadStatusTransitions: cloneTransitions(
      positive
        ? CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS
        : CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.slice(0, 2),
    ),
    ...overrides,
  };
}

export function createEvidenceInput(): CodexAppServerPreflightEvidenceInput {
  return {
    codexExecutableDigest: CODEX_DIGEST,
    codexVersion: CODEX_VERSION,
    scenarioResults: [
      createScenarioEvidence(CodexPreflightScenario.AllowedUpdate),
      createScenarioEvidence(CodexPreflightScenario.OutOfSetUpdate),
    ],
  };
}

export function createRunnerResult(
  scenario: CodexPreflightScenario,
  processOverrides: Partial<CodexAppServerRunnerResult["process"]> = {},
): CodexAppServerRunnerResult {
  const positive = scenario === CodexPreflightScenario.AllowedUpdate;
  return {
    status: positive ? CODEX_APP_SERVER_OUTCOMES.Succeeded : CODEX_APP_SERVER_OUTCOMES.Denied,
    outcome: positive ? CODEX_APP_SERVER_OUTCOMES.Succeeded : CODEX_APP_SERVER_OUTCOMES.Denied,
    process: {
      processStarted: true,
      processMayBeRunning: false,
      outcomeUnknown: false,
      exitCode: 0,
      signal: null,
      timedOut: false,
      outputLimitExceeded: false,
      stderrLimitExceeded: false,
      terminationReason: null,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutDigest: "a".repeat(64),
      stderrDigest: "b".repeat(64),
      ...processOverrides,
    },
    protocolEvidence: {
      threadId: "thread-preflight",
      turnId: "turn-preflight",
      eventCount: 10,
      responseCount: 2,
      requestCount: 1,
      notificationCount: 7,
      methodCounts: {},
      unknownMethodCount: 0,
      unknownMethods: [],
      itemCount: 1,
      fileChangeItemCount: 1,
      completedFileChangeCount: positive ? 1 : 0,
      approvedCount: positive ? 1 : 0,
      cancelledCount: positive ? 0 : 1,
      authorizations: [
        {
          itemId: "item-preflight",
          decision: positive
            ? CODEX_APP_SERVER_APPROVAL_DECISIONS.Accept
            : CODEX_APP_SERVER_APPROVAL_DECISIONS.Cancel,
          evidenceDigest: "c".repeat(64),
        },
      ],
      threadStatusTransitions: cloneTransitions(
        positive
          ? CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS
          : CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.slice(0, 2),
      ),
      changeDigest: "d".repeat(64),
    },
  };
}

export function createWorkspace(
  descriptor: CodexPreflightTemporaryRootDescriptor,
  scenario: CodexPreflightScenario,
): CodexPreflightScenarioWorkspace {
  const directory = scenario === CodexPreflightScenario.AllowedUpdate ? "allowed" : "denied";
  const root = `${descriptor.root}\\${directory}`;
  const worktreeRoot = `${root}\\worktree`;
  return {
    descriptor,
    scenario,
    root,
    worktreeRoot,
    codexHome: `${root}\\codex-home`,
    sqliteHome: `${root}\\codex-home\\sqlite`,
    profileHome: `${root}\\home`,
    tempHome: `${root}\\temp`,
    targetPath: `${worktreeRoot}\\target.txt`,
    outOfSetPath: `${worktreeRoot}\\outOfSet.txt`,
  };
}

export function createServer(
  scenario = CodexPreflightScenario.OutOfSetUpdate,
): CodexPreflightResponsesServerHandle {
  const positive = scenario === CodexPreflightScenario.AllowedUpdate;
  return {
    baseUrl: "http://127.0.0.1:34123/v1/" + "a".repeat(64),
    getEvidence: () => ({
      localModelRequestCount: 1,
      requestCount: positive ? 2 : 1,
      completedResponseCount: positive ? 2 : 1,
    }),
    close: () => Promise.resolve({ confirmed: true as const }),
  };
}

function cloneTransitions(
  transitions: readonly CodexAppServerThreadStatusTransition[],
): CodexAppServerThreadStatusTransition[] {
  return transitions.map((transition) => ({
    type: transition.type,
    ...(transition.activeFlags === undefined ? {} : { activeFlags: [...transition.activeFlags] }),
  }));
}
