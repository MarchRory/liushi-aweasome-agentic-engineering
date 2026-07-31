import { URL } from "node:url";

import {
  CODEX_APP_SERVER_APPROVAL_DECISIONS,
  CODEX_APP_SERVER_CHANGE_KINDS,
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS,
  type CodexAppServerProtocolEvidence,
  type CodexAppServerRunnerOverrides,
  type CodexAppServerRunnerResult,
} from "../../appServer/index.js";
import { CodexAppServerError } from "../../appServer/contracts/index.js";
import {
  CODEX_MODEL_PROVIDER_ID,
  CodexWireApi,
  REASONING_EFFORT,
  createCodexAppServerArguments,
  serializeTomlValue,
} from "../../sessionFlags/index.js";
import { CODEX_PREFLIGHT_PROMPT, CODEX_PREFLIGHT_RUNNER_LIMITS } from "../constants/index.js";
import type {
  CodexAppServerPreflightConfig,
  CodexAppServerPreflightScenarioEvidence,
  CodexPreflightResponsesServerHandle,
  CodexPreflightScenarioWorkspace,
} from "../contracts/index.js";
import { CodexPreflightResult, CodexPreflightScenario } from "../enums/index.js";
import { createCodexPreflightEnvironment } from "../environment/index.js";
import { sameCodexPreflightPath } from "../platform/index.js";

/** 单场景执行依赖。 */
interface CodexPreflightScenarioDependencies {
  readonly runCodexAgentAppServer: (
    input: unknown,
    overrides?: CodexAppServerRunnerOverrides,
  ) => Promise<CodexAppServerRunnerResult>;
  readonly runnerOverrides: CodexAppServerRunnerOverrides;
  readonly verifyScenarioWorkspace: (
    workspace: CodexPreflightScenarioWorkspace,
    trustedTempParent?: string,
  ) => Promise<{ readonly targetChanged: boolean }>;
  readonly trustedTempParent: string | undefined;
}

/** 单场景执行输入。 */
interface CodexPreflightScenarioInput {
  readonly config: CodexAppServerPreflightConfig;
  readonly scenario: CodexPreflightScenario;
  readonly workspace: CodexPreflightScenarioWorkspace;
  readonly server: CodexPreflightResponsesServerHandle;
  readonly dependencies: CodexPreflightScenarioDependencies;
}

/** 运行并验证一个确定性 App Server 审批场景。 */
export async function runCodexPreflightScenario(
  input: CodexPreflightScenarioInput,
): Promise<CodexAppServerPreflightScenarioEvidence> {
  const positive = input.scenario === CodexPreflightScenario.AllowedUpdate;
  const expectedPath = positive ? input.workspace.targetPath : input.workspace.outOfSetPath;
  const expectedOutcome = positive
    ? CODEX_APP_SERVER_OUTCOMES.Succeeded
    : CODEX_APP_SERVER_OUTCOMES.Denied;
  const baseUrl = requireLoopbackBaseUrl(input.server.baseUrl);
  const arguments_ = createProviderArguments(baseUrl);
  const result = await input.dependencies.runCodexAgentAppServer(
    {
      executable: input.config.executable,
      arguments: arguments_,
      prompt: CODEX_PREFLIGHT_PROMPT,
      model: input.config.model,
      modelProvider: CODEX_MODEL_PROVIDER_ID,
      cwd: input.workspace.worktreeRoot,
      runtimeWorkspaceRoots: [input.workspace.worktreeRoot],
      allowedPaths: [expectedPath],
      environment: createCodexPreflightEnvironment({
        codexHome: input.workspace.codexHome,
        sqliteHome: input.workspace.sqliteHome,
        profileHome: input.workspace.profileHome,
        tempHome: input.workspace.tempHome,
        ...(input.config.sourceEnvironment === undefined
          ? {}
          : { sourceEnvironment: input.config.sourceEnvironment }),
      }),
      authorizeFileChange: createAuthorization(input.scenario, expectedPath),
      ...CODEX_PREFLIGHT_RUNNER_LIMITS,
    },
    input.dependencies.runnerOverrides,
  );

  validateRunnerResult(result, input.scenario, expectedOutcome);
  const serverEvidence = input.server.getEvidence();
  const diskEvidence = await input.dependencies.verifyScenarioWorkspace(
    input.workspace,
    input.dependencies.trustedTempParent,
  );

  return {
    scenario: input.scenario,
    result: positive ? CodexPreflightResult.Accepted : CodexPreflightResult.Cancelled,
    outcome: result.outcome,
    approvalRequestCount: 1,
    localModelRequestCount: requireOne(
      serverEvidence.localModelRequestCount,
      "localModelRequestCount",
    ),
    responsesRequestCount: serverEvidence.requestCount,
    completedResponseCount: serverEvidence.completedResponseCount,
    targetChanged: diskEvidence.targetChanged,
    processExited: true,
    processMayBeRunning: false,
    threadStatusTransitions: cloneTransitions(result.protocolEvidence.threadStatusTransitions),
  };
}

function createProviderArguments(baseUrl: string): string[] {
  return createCodexAppServerArguments([
    `model_provider=${serializeTomlValue(CODEX_MODEL_PROVIDER_ID)}`,
    `model_providers.${CODEX_MODEL_PROVIDER_ID}=${serializeTomlValue({
      name: "OpenAI",
      base_url: baseUrl,
      wire_api: CodexWireApi.Responses,
      requires_openai_auth: false,
      supports_websockets: false,
    })}`,
    `model_reasoning_effort=${serializeTomlValue(REASONING_EFFORT)}`,
  ]);
}

function createAuthorization(scenario: CodexPreflightScenario, expectedPath: string) {
  return (proposal: {
    readonly grantRoot: null;
    readonly changes: readonly {
      readonly path: string;
      readonly kind: CODEX_APP_SERVER_CHANGE_KINDS;
    }[];
  }) => {
    const change = proposal.changes[0];
    if (
      proposal.grantRoot !== null ||
      proposal.changes.length !== 1 ||
      change === undefined ||
      change.kind !== CODEX_APP_SERVER_CHANGE_KINDS.Update ||
      !sameCodexPreflightPath(change.path, expectedPath)
    ) {
      throw new Error("Preflight 收到的 FileChange proposal 与固定场景不一致");
    }
    return {
      approved: scenario === CodexPreflightScenario.AllowedUpdate,
      evidence: {
        control: "codex-app-server-preflight",
        scenario,
      },
    };
  };
}

function validateRunnerResult(
  result: CodexAppServerRunnerResult,
  scenario: CodexPreflightScenario,
  expectedOutcome: CODEX_APP_SERVER_OUTCOMES,
): void {
  const positive = scenario === CodexPreflightScenario.AllowedUpdate;
  if (
    result.outcome !== expectedOutcome ||
    result.status !== expectedOutcome ||
    result.process.processStarted !== true ||
    result.process.processMayBeRunning !== false ||
    result.process.outcomeUnknown !== false ||
    result.process.timedOut !== false ||
    result.process.outputLimitExceeded !== false ||
    result.process.stderrLimitExceeded !== false
  ) {
    throw new CodexAppServerError("Preflight Runner 未返回固定且已确认终止的 outcome", {
      processStarted: result.process.processStarted,
      processMayBeRunning:
        result.process.processMayBeRunning === true || result.process.outcomeUnknown === true,
      outcomeUnknown: result.process.outcomeUnknown,
      timedOut: result.process.timedOut,
      outputLimitExceeded: result.process.outputLimitExceeded,
      stderrLimitExceeded: result.process.stderrLimitExceeded,
      terminationReason: result.process.terminationReason,
      protocolEvidence: result.protocolEvidence,
    });
  }
  validateProtocolEvidence(result.protocolEvidence, positive);
}

function validateProtocolEvidence(
  evidence: CodexAppServerProtocolEvidence,
  positive: boolean,
): void {
  const expectedTransitions = positive
    ? CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS
    : CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.slice(0, 2);
  const expectedDecision = positive
    ? CODEX_APP_SERVER_APPROVAL_DECISIONS.Accept
    : CODEX_APP_SERVER_APPROVAL_DECISIONS.Cancel;
  if (
    typeof evidence.threadId !== "string" ||
    typeof evidence.turnId !== "string" ||
    evidence.requestCount !== 1 ||
    evidence.fileChangeItemCount !== 1 ||
    evidence.completedFileChangeCount !== (positive ? 1 : 0) ||
    evidence.approvedCount !== (positive ? 1 : 0) ||
    evidence.cancelledCount !== (positive ? 0 : 1) ||
    evidence.authorizations.length !== 1 ||
    evidence.authorizations[0]?.decision !== expectedDecision ||
    evidence.unknownMethodCount !== 0 ||
    evidence.unknownMethods.length !== 0 ||
    !/^[0-9a-f]{64}$/u.test(evidence.changeDigest) ||
    !equalTransitions(evidence.threadStatusTransitions, expectedTransitions)
  ) {
    throw new Error("Preflight App Server 协议证据无效");
  }
}

function equalTransitions(
  actual: readonly { readonly type: string; readonly activeFlags?: readonly string[] }[],
  expected: readonly { readonly type: string; readonly activeFlags?: readonly string[] }[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((transition, index) => {
      const reference = expected[index];
      return (
        reference !== undefined &&
        transition.type === reference.type &&
        equalStrings(transition.activeFlags ?? [], reference.activeFlags ?? [])
      );
    })
  );
}

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function cloneTransitions(
  transitions: CodexAppServerProtocolEvidence["threadStatusTransitions"],
): CodexAppServerProtocolEvidence["threadStatusTransitions"] {
  return transitions.map((transition) => ({
    type: transition.type,
    ...(transition.activeFlags === undefined ? {} : { activeFlags: [...transition.activeFlags] }),
  }));
}

function requireLoopbackBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !/^[1-9]\d{0,4}$/u.test(url.port) ||
    Number(url.port) > 65_535 ||
    !/^\/v1\/[0-9a-f]{64}$/u.test(url.pathname) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Preflight Provider 必须使用带 nonce 的 127.0.0.1 loopback URL");
  }
  return value;
}

function requireOne(value: number, label: string): 1 {
  if (value !== 1) throw new Error(`${label} 必须等于 1`);
  return 1;
}
