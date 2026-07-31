import { runCodexAgentAppServer } from "../../appServer/index.js";
import {
  createCodexAppServerPreflightEvidence,
  validateCodexAppServerPreflightEvidence,
} from "../evidence/index.js";
import type {
  CodexAppServerPreflightEvidence,
  CodexAppServerPreflightOverrides,
  CodexPreflightResponsesServerHandle,
  CodexPreflightScenarioResult,
  CodexPreflightTemporaryRootDescriptor,
} from "../contracts/index.js";
import { CodexPreflightScenario } from "../enums/index.js";
import {
  closeCodexPreflightResponsesServer,
  createCodexPreflightResponsesServer,
} from "../loopback/index.js";
import {
  cleanupCodexPreflightTemporaryRoot,
  createCodexPreflightScenarioWorkspace,
  createCodexPreflightTemporaryRoot,
  verifyCodexPreflightScenarioWorkspace,
} from "../workspace/index.js";
import { validateCodexAppServerPreflightInput } from "./preflightInput.validation.js";
import { createCodexPreflightPatch } from "./preflightPatch.js";
import { runCodexPreflightScenario } from "./preflightScenario.probe.js";

const SCENARIOS = Object.freeze([
  CodexPreflightScenario.AllowedUpdate,
  CodexPreflightScenario.OutOfSetUpdate,
] as const);

/** 失败时附带的进程与临时根恢复信息。 */
interface CodexPreflightFailure extends Error {
  processMayBeRunning?: boolean;
  preservedRootDescriptor?: CodexPreflightTemporaryRootDescriptor;
  cleanupError?: unknown;
}

/** 运行两个本机零模型场景并返回绑定 Codex 身份的正式证据。 */
export async function probeCodexAppServerFileChangeApproval(
  input: unknown,
  overrides: CodexAppServerPreflightOverrides = {},
): Promise<CodexAppServerPreflightEvidence> {
  const config = validateCodexAppServerPreflightInput(input);
  const dependencies = createDependencies(overrides);
  let descriptor: CodexPreflightTemporaryRootDescriptor | undefined;
  let failure: CodexPreflightFailure | undefined;
  let processMayBeRunning = false;
  const scenarioResults: CodexPreflightScenarioResult[] = [];

  try {
    descriptor = await dependencies.createTemporaryRoot(dependencies.trustedTempParent);
    for (const scenario of SCENARIOS) {
      let server: CodexPreflightResponsesServerHandle | undefined;
      try {
        const workspace = await dependencies.createScenarioWorkspace(
          { descriptor, scenario },
          dependencies.trustedTempParent,
        );
        server = await dependencies.createResponsesServer({
          scenario,
          patch: createCodexPreflightPatch(scenario),
          model: config.model,
        });
        scenarioResults.push(
          await runCodexPreflightScenario({
            config,
            scenario,
            workspace,
            server,
            dependencies,
          }),
        );
      } catch (cause) {
        failure = asFailure(cause);
        processMayBeRunning = failure.processMayBeRunning === true;
      } finally {
        if (server !== undefined) {
          try {
            await dependencies.closeResponsesServer(server);
          } catch (cause) {
            failure ??= asFailure(cause);
          }
        }
      }
      if (failure !== undefined) break;
    }
  } catch (cause) {
    failure = asFailure(cause);
    processMayBeRunning ||= failure.processMayBeRunning === true;
  }

  let evidence: CodexAppServerPreflightEvidence | undefined;
  if (failure === undefined) {
    try {
      evidence = dependencies.createEvidence({
        codexExecutableDigest: config.codexExecutableDigest,
        codexVersion: config.codexVersion,
        scenarioResults,
      });
      evidence = validateCodexAppServerPreflightEvidence(evidence, {
        codexExecutableDigest: config.codexExecutableDigest,
        codexVersion: config.codexVersion,
      });
    } catch (cause) {
      failure = asFailure(cause);
    }
  }

  if (descriptor !== undefined) {
    if (processMayBeRunning) {
      failure ??= new Error("Preflight process termination 未确认");
      failure.preservedRootDescriptor = descriptor;
      failure.processMayBeRunning = true;
    } else {
      try {
        await dependencies.cleanupTemporaryRoot(descriptor, dependencies.trustedTempParent);
      } catch (cause) {
        const cleanupFailure = asFailure(cause);
        if (failure === undefined) {
          failure = cleanupFailure;
        } else {
          failure.cleanupError = cleanupFailure;
        }
        failure.preservedRootDescriptor = descriptor;
      }
    }
  }

  if (failure !== undefined) throw failure;
  if (evidence === undefined) throw new Error("Preflight evidence 未生成");
  return evidence;
}

function createDependencies(overrides: CodexAppServerPreflightOverrides) {
  return {
    trustedTempParent: overrides.trustedTempParent,
    createEvidence: overrides.createEvidence ?? createCodexAppServerPreflightEvidence,
    createResponsesServer: overrides.createResponsesServer ?? createCodexPreflightResponsesServer,
    closeResponsesServer: overrides.closeResponsesServer ?? closeCodexPreflightResponsesServer,
    createTemporaryRoot: overrides.createTemporaryRoot ?? createCodexPreflightTemporaryRoot,
    cleanupTemporaryRoot: overrides.cleanupTemporaryRoot ?? cleanupCodexPreflightTemporaryRoot,
    createScenarioWorkspace:
      overrides.createScenarioWorkspace ?? createCodexPreflightScenarioWorkspace,
    verifyScenarioWorkspace:
      overrides.verifyScenarioWorkspace ?? verifyCodexPreflightScenarioWorkspace,
    runCodexAgentAppServer: overrides.runCodexAgentAppServer ?? runCodexAgentAppServer,
    runnerOverrides: overrides.runnerOverrides ?? {},
  };
}

function asFailure(cause: unknown): CodexPreflightFailure {
  return cause instanceof Error ? cause : new Error(String(cause));
}
