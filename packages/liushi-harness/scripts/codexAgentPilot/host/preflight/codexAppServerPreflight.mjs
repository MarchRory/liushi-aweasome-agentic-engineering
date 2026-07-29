import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";

import {
  CODEX_MODEL_PROVIDER_ID,
  REASONING_EFFORT,
  SOTA_MODEL_ID,
} from "../../constants/index.mjs";
import {
  CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS,
  runCodexAgentAppServer as defaultRunCodexAgentAppServer,
} from "../agentRunner/appServer/index.mjs";
import { createCodexAppServerArguments, serializeTomlValue } from "../sessionFlags/index.mjs";
import {
  createCodexAppServerPreflightEvidence,
  validateCodexAppServerPreflightEvidence,
} from "./preflightEvidence.mjs";
import {
  CODEX_PREFLIGHT_CHANGE_KINDS,
  CODEX_PREFLIGHT_INITIAL_CONTENT,
  CODEX_PREFLIGHT_OUT_OF_SET_CONTENT,
  CODEX_PREFLIGHT_OUT_OF_SET_FILE,
  CODEX_PREFLIGHT_OUTCOMES,
  CODEX_PREFLIGHT_RESULTS,
  CODEX_PREFLIGHT_SCENARIOS,
  CODEX_PREFLIGHT_TARGET_FILE,
  CODEX_PREFLIGHT_PROMPT,
  CODEX_PREFLIGHT_UPDATED_CONTENT,
  CODEX_PREFLIGHT_VERSION,
} from "./preflightConstants.mjs";
import { createCodexPreflightEnvironment } from "./preflightEnvironment.mjs";
import {
  cleanupCodexPreflightTemporaryRoot,
  createCodexPreflightScenarioWorkspace,
  createCodexPreflightTemporaryRoot,
  verifyCodexPreflightScenarioWorkspace,
} from "./preflightTemporaryRoot.mjs";
import {
  closeCodexPreflightResponsesServer,
  createCodexPreflightResponsesServer,
} from "./responsesSseServer.mjs";

const SCENARIOS = Object.freeze([
  Object.freeze({
    key: CODEX_PREFLIGHT_SCENARIOS.AllowedUpdate,
    result: CODEX_PREFLIGHT_RESULTS.Accepted,
    patch: createUpdatePatch(),
  }),
  Object.freeze({
    key: CODEX_PREFLIGHT_SCENARIOS.OutOfSetUpdate,
    result: CODEX_PREFLIGHT_RESULTS.Cancelled,
    patch: createOutOfSetPatch(),
  }),
]);

export async function probeCodexAppServerFileChangeApproval(input, overrides = {}) {
  const config = validateInput(input);
  const dependencies = createDependencies(overrides);
  let rootContext;
  let activeServer = null;
  let failure = null;
  let processMayBeRunning = false;
  let preservedRoot = false;
  let evidence;
  const scenarioResults = [];

  try {
    rootContext = await dependencies.createTemporaryRoot({ prefix: "codex-app-server-preflight" });
    const root = requireRoot(rootContext);

    for (const descriptor of SCENARIOS) {
      let workspace;
      try {
        workspace = await createCodexPreflightScenarioWorkspace({
          root,
          ownerToken: rootContext?.ownerToken,
          scenario: descriptor.key,
        });
        activeServer = await dependencies.createResponsesServer({
          patch: descriptor.patch,
          scenario: descriptor.key,
          worktreeRoot: workspace.worktreeRoot,
        });
        scenarioResults.push(
          await runScenario({
            config,
            descriptor,
            workspace,
            server: activeServer,
            dependencies,
          }),
        );
      } catch (error) {
        failure = error;
        processMayBeRunning ||= error?.processMayBeRunning === true;
        break;
      } finally {
        if (activeServer !== null) {
          try {
            await dependencies.closeResponsesServer(activeServer);
            activeServer = null;
          } catch (error) {
            failure ??= error;
            processMayBeRunning = true;
            activeServer = null;
          }
        }
      }
    }

    if (failure === null) {
      evidence = dependencies.createEvidence({
        codexExecutableDigest: config.codexExecutableDigest,
        codexVersion: config.codexVersion,
        scenarioResults,
      });
      validateCodexAppServerPreflightEvidence(evidence, config);
    }
  } catch (error) {
    failure ??= error;
    processMayBeRunning ||= error?.processMayBeRunning === true;
  }

  if (activeServer !== null) {
    try {
      await dependencies.closeResponsesServer(activeServer);
    } catch (error) {
      failure ??= error;
      processMayBeRunning = true;
    }
  }

  if (rootContext !== undefined) {
    const root = requireRoot(rootContext);
    if (processMayBeRunning) {
      preservedRoot = true;
    } else {
      try {
        await dependencies.cleanupTemporaryRoot(root, rootContext);
      } catch (error) {
        failure ??= error;
        preservedRoot = true;
      }
    }
  }

  if (failure !== null) {
    throw enrichPreflightError(failure, rootContext, { processMayBeRunning, preservedRoot });
  }
  return evidence;
}

function createDependencies(overrides) {
  return {
    createEvidence:
      overrides.createEvidence ??
      overrides.createPreflightEvidence ??
      createCodexAppServerPreflightEvidence,
    createResponsesServer:
      overrides.createResponsesServer ??
      overrides.createLoopbackResponsesServer ??
      ((input) => createCodexPreflightResponsesServer(input, overrides)),
    closeResponsesServer:
      overrides.closeResponsesServer ??
      overrides.closeLoopbackResponsesServer ??
      closeCodexPreflightResponsesServer,
    createTemporaryRoot:
      overrides.createTemporaryRoot ??
      overrides.createOwnedTemporaryRoot ??
      ((input) => createCodexPreflightTemporaryRoot({ ...overrides, ...input })),
    cleanupTemporaryRoot:
      overrides.cleanupTemporaryRoot ??
      overrides.cleanupOwnedTemporaryRoot ??
      ((root) => cleanupCodexPreflightTemporaryRoot(root, overrides)),
    runCodexAgentAppServer:
      overrides.runCodexAgentAppServer ??
      overrides.runCodexAppServer ??
      defaultRunCodexAgentAppServer,
    runnerOverrides: overrides.runnerOverrides ?? {},
  };
}

async function runScenario(input) {
  const baseUrl = requireLoopbackBaseUrl(input.server?.baseUrl ?? input.server?.url);
  const provider = {
    name: "OpenAI",
    base_url: baseUrl,
    wire_api: "responses",
    requires_openai_auth: false,
    supports_websockets: false,
  };
  const argumentsList = createCodexAppServerArguments([
    `model_provider=${serializeTomlValue(CODEX_MODEL_PROVIDER_ID)}`,
    `model_providers.${CODEX_MODEL_PROVIDER_ID}=${serializeTomlValue(provider)}`,
    `model_reasoning_effort=${serializeTomlValue(REASONING_EFFORT)}`,
  ]);
  const authorizeFileChange = async (proposal) => {
    const onlyTargetUpdate =
      Array.isArray(proposal?.changes) &&
      proposal.changes.length === 1 &&
      proposal.changes[0]?.kind === CODEX_PREFLIGHT_CHANGE_KINDS.Update &&
      samePath(proposal.changes[0]?.path, input.workspace.targetPath);
    if (input.descriptor.key === CODEX_PREFLIGHT_SCENARIOS.AllowedUpdate && onlyTargetUpdate) {
      return { approved: true, evidence: { source: "codex-app-server-preflight" } };
    }
    return { approved: false, evidence: { source: "codex-app-server-preflight" } };
  };
  const runnerInput = {
    executable: input.config.executable,
    arguments: argumentsList,
    prompt: CODEX_PREFLIGHT_PROMPT,
    model: input.config.model,
    modelProvider: CODEX_MODEL_PROVIDER_ID,
    cwd: input.workspace.worktreeRoot,
    runtimeWorkspaceRoots: [input.workspace.worktreeRoot],
    allowedPaths: [input.workspace.targetPath],
    environment: createCodexPreflightEnvironment({
      sourceEnvironment: input.config.sourceEnvironment,
      codexHome: input.workspace.codexHome,
      sqliteHome: input.workspace.sqliteHome,
      profileHome: input.workspace.profileHome,
      tempHome: input.workspace.tempHome,
    }),
    authorizeFileChange,
    scenario: input.descriptor.key,
  };
  let result;
  let error;
  try {
    result = await input.dependencies.runCodexAgentAppServer(runnerInput, {
      ...input.dependencies.runnerOverrides,
      executable: input.config.executable,
      arguments: argumentsList,
    });
  } catch (cause) {
    error = cause;
  }

  const processInfo =
    result?.process ?? (result?.processMayBeRunning !== undefined ? result : undefined) ?? error;
  if (processInfo?.processMayBeRunning !== false) {
    const processError =
      error instanceof Error ? error : new Error("app-server exit was not confirmed");
    processError.processMayBeRunning = true;
    processError.protocolEvidence ??= error?.protocolEvidence ?? result?.protocolEvidence ?? null;
    throw processError;
  }
  const protocolEvidence = result?.protocolEvidence ?? error?.protocolEvidence;
  validateProtocolEvidence(protocolEvidence, input.descriptor.key);
  const serverEvidence = readServerEvidence(input.server);
  if (serverEvidence.localModelRequestCount !== 1) {
    throw new Error("preflight Responses server did not receive exactly one tool-call request");
  }
  const disk = await verifyCodexPreflightScenarioWorkspace(input.workspace);

  if (input.descriptor.key === CODEX_PREFLIGHT_SCENARIOS.AllowedUpdate) {
    if (error !== undefined || !isSuccessful(result)) {
      throw error ?? new Error("allowed preflight app-server did not succeed");
    }
  }

  return {
    scenario: input.descriptor.key,
    result: input.descriptor.result,
    approvalRequestCount: protocolEvidence.approvedCount + protocolEvidence.cancelledCount,
    localModelRequestCount: serverEvidence.localModelRequestCount,
    targetChanged: disk.targetChanged,
    processExited: true,
    processMayBeRunning: false,
    threadStatusTransitions: cloneThreadStatusTransitions(protocolEvidence.threadStatusTransitions),
  };
}

function validateInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("preflight input must be an object");
  }
  const executable = input.executable ?? input.codexExecutable;
  if (
    typeof executable !== "string" ||
    executable.length === 0 ||
    executable.includes("\0") ||
    (!isAbsolute(executable) && !/^[A-Za-z]:[\\/]/u.test(executable))
  ) {
    throw new TypeError("preflight executable must be an absolute path");
  }
  if (input.codexVersion !== CODEX_PREFLIGHT_VERSION) {
    throw new Error(`preflight only supports Codex ${CODEX_PREFLIGHT_VERSION}`);
  }
  if (typeof input.codexExecutableDigest !== "string") {
    throw new TypeError("codexExecutableDigest is required");
  }
  return {
    executable,
    codexExecutableDigest: input.codexExecutableDigest,
    codexVersion: input.codexVersion,
    model: input.model ?? SOTA_MODEL_ID,
    sourceEnvironment: input.sourceEnvironment,
  };
}

function validateProtocolEvidence(protocolEvidence, scenario) {
  const requiredTransitions =
    scenario === CODEX_PREFLIGHT_SCENARIOS.AllowedUpdate
      ? CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS
      : CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.slice(0, 2);
  if (
    protocolEvidence === null ||
    typeof protocolEvidence !== "object" ||
    Array.isArray(protocolEvidence) ||
    protocolEvidence.approvedCount !==
      (scenario === CODEX_PREFLIGHT_SCENARIOS.AllowedUpdate ? 1 : 0) ||
    protocolEvidence.cancelledCount !==
      (scenario === CODEX_PREFLIGHT_SCENARIOS.AllowedUpdate ? 0 : 1) ||
    JSON.stringify(protocolEvidence.threadStatusTransitions) !== JSON.stringify(requiredTransitions)
  ) {
    throw new Error("preflight app-server protocol evidence is invalid");
  }
}

function cloneThreadStatusTransitions(value) {
  if (!Array.isArray(value)) {
    throw new Error("preflight thread status transitions are missing");
  }
  return value.map((transition) =>
    transition.activeFlags === undefined
      ? { type: transition.type }
      : { type: transition.type, activeFlags: [...transition.activeFlags] },
  );
}

function readServerEvidence(server) {
  const evidence =
    typeof server?.getEvidence === "function" ? server.getEvidence() : server?.evidence;
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("preflight Responses server evidence is missing");
  }
  const localModelRequestCount =
    evidence.localModelRequestCount ?? evidence.toolCallCount ?? evidence.requestCount;
  return { ...evidence, localModelRequestCount };
}

function isSuccessful(result) {
  return (
    result?.outcome === CODEX_PREFLIGHT_OUTCOMES.Succeeded ||
    result?.status === CODEX_PREFLIGHT_OUTCOMES.Succeeded
  );
}

function requireLoopbackBaseUrl(value) {
  if (typeof value !== "string") throw new TypeError("loopback Responses base URL is required");
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/v1") {
    throw new Error("preflight provider must use the 127.0.0.1 /v1 loopback URL");
  }
  return value;
}

function requireRoot(rootContext) {
  const root = typeof rootContext === "string" ? rootContext : rootContext?.root;
  if (typeof root !== "string" || root.length === 0) {
    throw new TypeError("preflight temporary root is missing");
  }
  return root;
}

function enrichPreflightError(error, rootContext, state) {
  const enriched = error instanceof Error ? error : new Error(String(error));
  const root = rootContext === undefined ? undefined : requireRoot(rootContext);
  if (state.processMayBeRunning) enriched.processMayBeRunning = true;
  if (state.preservedRoot && root !== undefined) enriched.preservedRoot = root;
  return enriched;
}

function samePath(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function createUpdatePatch() {
  return [
    "*** Begin Patch",
    `*** Update File: ${CODEX_PREFLIGHT_TARGET_FILE}`,
    "@@",
    `-${CODEX_PREFLIGHT_INITIAL_CONTENT.trimEnd()}`,
    `+${CODEX_PREFLIGHT_UPDATED_CONTENT.trimEnd()}`,
    "*** End Patch",
    "",
  ].join("\n");
}

function createOutOfSetPatch() {
  return [
    "*** Begin Patch",
    `*** Add File: ${CODEX_PREFLIGHT_OUT_OF_SET_FILE}`,
    `+${CODEX_PREFLIGHT_OUT_OF_SET_CONTENT.trimEnd()}`,
    "*** End Patch",
    "",
  ].join("\n");
}
