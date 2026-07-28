import {
  APPROVAL_POLICY,
  CODEX_HOOK_SOURCE,
  FORBIDDEN_ACTIONS,
  HOST_APPROVAL_SCHEMA_VERSION,
  HOST_PREFLIGHT_PROCESS_COUNT,
  PERMISSION_MODE,
  REASONING_EFFORT,
  STATE_STATUS,
} from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import { createCodexAgentArguments } from "../sessionFlags/index.mjs";

export function createCodexHostApprovalPacket(input) {
  const sessionFlags = {
    declarationOverrides: [...input.hookDeclarationOverrides],
    trustOverride: input.hookTrustOverride,
  };
  const launchArguments = createCodexAgentArguments({
    hookDeclarationOverrides: sessionFlags.declarationOverrides,
    hookTrustOverride: sessionFlags.trustOverride,
    worktreeRoot: input.artifacts.worktreeRoot,
    model: input.state.model,
    sandbox: PERMISSION_MODE,
    approvalPolicy: APPROVAL_POLICY,
  });
  const packet = {
    schemaVersion: HOST_APPROVAL_SCHEMA_VERSION,
    status: STATE_STATUS.WaitingHostApproval,
    basedOn: {
      stateDigest: input.state.stateDigest,
      activationDigest: input.state.activation.activationDigest,
    },
    actor: {
      humanActorId: input.state.actor.humanActorId,
      agentActorId: input.state.actor.agentActorId,
    },
    project: {
      repositoryId: input.state.fixedProject.repositoryId,
      repositoryRevision: input.state.fixedProject.revision,
      writeSet: [...input.state.fixedProject.writeSet],
      historicalLogicChange: input.state.fixedProject.historicalLogicChange,
      worktree: input.worktreeIdentity,
    },
    codex: {
      executable: input.state.identities.codex,
      homeSource: input.state.codex.homeSource,
      userConfigLoaded: false,
      rulesLoaded: false,
    },
    harnessCli: input.state.identities.consumer,
    model: {
      id: input.state.model,
      reasoningEffort: REASONING_EFFORT,
    },
    permissions: {
      sandbox: PERMISSION_MODE,
      approvalPolicy: APPROVAL_POLICY,
      ephemeral: true,
    },
    prompt: {
      file: input.artifacts.promptFile,
      digest: input.state.activation.promptDigest,
      fixed: true,
    },
    activation: {
      manifestFile: input.artifacts.manifestFile,
      sessionId: input.artifacts.manifest.sessionId,
      digest: calculateDigest(input.artifacts.manifest),
      result: input.state.activation.result,
    },
    hooks: {
      source: CODEX_HOOK_SOURCE,
      candidateFile: input.artifacts.candidateConfigFile,
      candidateDigest: input.state.activation.candidateConfigDigest,
      sessionFlags: {
        ...sessionFlags,
        digest: calculateDigest(sessionFlags),
      },
      discovered: input.trustedHooks,
      persistentConfigWrites: 0,
      persistentTrustWrites: 0,
      trustBypassAllowed: false,
    },
    preflight: {
      appServerProcesses: HOST_PREFLIGHT_PROCESS_COUNT,
      modelProcesses: 0,
      untrustedDiscoveryVerified: true,
      ephemeralTrustVerified: true,
      isolatedCodexHomeRemoved: true,
    },
    launch: {
      executable: input.state.codex.executable,
      arguments: launchArguments,
      cwd: input.artifacts.worktreeRoot,
      stdin: {
        kind: "file",
        file: input.artifacts.promptFile,
        digest: input.state.activation.promptDigest,
      },
      executed: false,
    },
    effects: {
      ...input.state.effects,
      hostPreflightProcesses: HOST_PREFLIGHT_PROCESS_COUNT,
      hookWrites: 0,
      modelLaunches: 0,
    },
    requiredHumanApproval: {
      exactPacketDigest: true,
      exactStateDigest: true,
      exactActor: true,
      launchSeparatelyApproved: true,
    },
    forbiddenActions: [...FORBIDDEN_ACTIONS],
    forbiddenFlags: [
      "--dangerously-bypass-hook-trust",
      "--dangerously-bypass-approvals-and-sandbox",
    ],
  };
  return { ...packet, packetDigest: calculateDigest(packet) };
}
