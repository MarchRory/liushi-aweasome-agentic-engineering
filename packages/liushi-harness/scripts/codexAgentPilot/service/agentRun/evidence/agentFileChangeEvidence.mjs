import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  AGENT_FILE_CHANGE_PROJECTION_SCHEMA_VERSION,
  AGENT_SESSION_PROCESS_HOST_SURFACE,
  AGENT_SESSION_PROCESS_OUTCOME,
  CODEX_AGENT_EXECUTION_MODE,
  CODEX_AGENT_EXECUTOR_ID,
  CODEX_FILE_CHANGE_DECISION,
  CODEX_HOOK_EVENTS,
  CODEX_HOOK_PERMISSION_MODE,
  CODEX_HOOK_TOOL,
} from "../../../constants/index.mjs";
import { calculateDigest } from "../../../digest/index.mjs";
import { CODEX_APP_SERVER_OUTCOMES } from "../../../host/index.mjs";
import { analyzeCodexAppServerProtocol } from "../execution/index.mjs";

export async function createAgentFileChangeEvidenceSession(input, overrides = {}) {
  const createApplication =
    overrides.createApplication ?? (await loadCreateHarnessApplication(input.paths.consumerRoot));
  const application = await createApplication({
    storeRoot: input.paths.runtimeRoot,
    codingTaskSessionRuntimeBinding: {
      workspaceId: input.approvedState.task.workspaceId,
      repositoryId: input.approvedState.fixedProject.repositoryId,
      repositoryRoot: input.paths.repositoryRoot,
      agentActorId: input.approvedState.actor.agentActorId,
    },
  });
  let preInput = null;
  let proposal = null;
  let completed = false;

  return {
    recordPreAction: async (nextProposal) => {
      if (preInput !== null) throw new Error("Session Action PreAction 不能重复记录。");
      proposal = cloneProposal(nextProposal);
      preInput = createPreInput(input, proposal);
      const result = await application.handleCodexHook.execute(preInput);
      requireHookSuccess(result, CODEX_HOOK_EVENTS.PreToolUse);
    },
    recordPostAction: async ({ runnerResult, startedAt, completedAt }) => {
      if (preInput === null || proposal === null) {
        throw new Error("缺少 Session Action PreAction，拒绝记录 PostAction。");
      }
      if (completed) throw new Error("Session Action PostAction 不能重复记录。");
      const protocol = validateSuccessfulRunnerResult(runnerResult, proposal);
      const toolResponse = {
        success: true,
        status: "completed",
        projection: CODEX_AGENT_EXECUTION_MODE.AppServerFileChangeApproval,
        authorizationEvidenceDigest: protocol.authorization.evidenceDigest,
        changeDigest: protocol.evidence.changeDigest,
      };
      const post = await application.handleCodexHook.execute({
        ...preInput,
        hook_event_name: CODEX_HOOK_EVENTS.PostToolUse,
        tool_response: toolResponse,
      });
      requireHookSuccess(post, CODEX_HOOK_EVENTS.PostToolUse);
      await recordProcessEvidence({
        application,
        pilot: input,
        preInput,
        runnerResult,
        startedAt,
        completedAt,
      });
      completed = true;
    },
  };
}

function createPreInput(input, proposal) {
  return {
    session_id: proposal.threadId,
    cwd: input.artifacts.worktreeRoot,
    hook_event_name: CODEX_HOOK_EVENTS.PreToolUse,
    model: input.packet.model.id,
    permission_mode: CODEX_HOOK_PERMISSION_MODE.Default,
    turn_id: proposal.turnId,
    transcript_path: null,
    tool_name: CODEX_HOOK_TOOL.ApplyPatch,
    tool_use_id: proposal.itemId,
    tool_input: {
      schemaVersion: AGENT_FILE_CHANGE_PROJECTION_SCHEMA_VERSION,
      projection: CODEX_AGENT_EXECUTION_MODE.AppServerFileChangeApproval,
      appServerProposal: proposal,
      command: [
        "*** Begin Patch",
        `*** Update File: ${input.approvedState.fixedProject.writeSet[0]}`,
        "@@",
        "*** End Patch",
      ].join("\n"),
    },
  };
}

async function recordProcessEvidence(input) {
  const durationMs = Date.parse(input.completedAt) - Date.parse(input.startedAt);
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
    throw new Error("Agent Session Process Evidence durationMs 无效。");
  }
  const result = await input.application.recordAgentSessionProcessEvidence.execute({
    workspaceId: input.pilot.approvedState.task.workspaceId,
    sessionId: input.pilot.approvedState.activation.manifest.sessionId,
    claimedExecutorSessionIdDigest: calculateDigest(input.preInput.session_id),
    executorId: CODEX_AGENT_EXECUTOR_ID,
    executorVersion: input.pilot.approvedState.identities.codex.version,
    executableDigest: input.pilot.approvedState.identities.codex.digest,
    hostSurface: AGENT_SESSION_PROCESS_HOST_SURFACE.Automation,
    modelId: input.pilot.packet.model.id,
    reasoningEffort: input.pilot.packet.model.reasoningEffort,
    permissionMode: input.pilot.packet.actionControl.permissionProfile,
    promptDigest: input.pilot.packet.prompt.digest,
    hookConfigDigest: input.pilot.packet.compatibilityArtifacts.candidateHooksDigest,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs,
    outcome: AGENT_SESSION_PROCESS_OUTCOME.Completed,
    exitCode: input.runnerResult.process.exitCode,
    signal: input.runnerResult.process.signal,
    timedOut: input.runnerResult.process.timedOut,
  });
  requireApplicationSuccess(result, "Agent Session Process Evidence");
}

function validateSuccessfulRunnerResult(result, proposal) {
  const protocol = analyzeCodexAppServerProtocol(result?.protocolEvidence);
  const evidence = protocol.evidence;
  const process = result?.process;
  const authorization = evidence?.authorizations?.[0];
  if (
    result?.outcome !== CODEX_APP_SERVER_OUTCOMES.Succeeded ||
    process?.processStarted !== true ||
    process?.processMayBeRunning !== false ||
    process?.exitCode !== 0 ||
    process?.signal !== null ||
    process?.timedOut !== false ||
    protocol.valid !== true ||
    evidence?.threadId !== proposal.threadId ||
    evidence?.turnId !== proposal.turnId ||
    authorization?.itemId !== proposal.itemId ||
    authorization?.decision !== CODEX_FILE_CHANGE_DECISION.Accept ||
    typeof authorization?.evidenceDigest !== "string" ||
    typeof evidence?.changeDigest !== "string"
  ) {
    throw new Error("App Server 成功事实不足，拒绝提交 Session Action PostAction。");
  }
  return { evidence, authorization };
}

function requireHookSuccess(result, eventName) {
  const value = requireApplicationSuccess(result, eventName);
  if (
    eventName === CODEX_HOOK_EVENTS.PreToolUse &&
    value !== null &&
    typeof value === "object" &&
    Object.hasOwn(value, "body")
  ) {
    throw new Error("Session Action PreAction 未返回无条件放行结果。");
  }
  if (value?.body?.decision === "block") {
    throw new Error("Session Action PostAction 被策略阻断。");
  }
}

function requireApplicationSuccess(result, label) {
  if (result?.status !== "success") {
    throw new Error(`${label} 写入失败。`, { cause: result?.error });
  }
  return result.value;
}

function cloneProposal(proposal) {
  return {
    threadId: proposal.threadId,
    turnId: proposal.turnId,
    itemId: proposal.itemId,
    changes: proposal.changes.map((change) => ({ ...change })),
    grantRoot: proposal.grantRoot,
  };
}

async function loadCreateHarnessApplication(consumerRoot) {
  const entrypoint = join(consumerRoot, "node_modules", "liushi-harness", "dist", "index.js");
  const module = await import(pathToFileURL(entrypoint).href);
  if (typeof module.createHarnessApplication !== "function") {
    throw new Error("安装包未导出 createHarnessApplication。");
  }
  return module.createHarnessApplication;
}
