import { resolve } from "node:path";

import {
  CODEX_AGENT_EXECUTION_MODE,
  CODEX_AGENT_OUTPUT_LIMIT_BYTES,
  CODEX_AGENT_STDERR_LIMIT_BYTES,
  CODEX_AGENT_TERMINATION_CONFIRMATION_TIMEOUT_MS,
  CODEX_AGENT_TIMEOUT_MS,
  CODEX_ACTION_CONTROL_KIND,
  CODEX_ALLOWED_FILE_CHANGE_KINDS,
  CODEX_ALLOWED_MUTATION_SURFACES,
  CODEX_APPROVAL_POLICY,
  CODEX_FILE_CHANGE_DECISION,
  CODEX_FILE_CHANGE_DECISION_SCOPE,
  CODEX_MODEL_LAUNCH_LIMIT,
  CODEX_MODEL_PROVIDER,
  CODEX_MODEL_PROVIDER_ID,
  CODEX_PERMISSION_PROFILE,
  FORBIDDEN_ACTIONS,
  HOST_APPROVAL_SCHEMA_VERSION,
  HOST_PREFLIGHT_PROCESS_COUNT,
  HOST_PREFLIGHT_REAL_MODEL_REQUEST_COUNT,
  REASONING_EFFORT,
  STATE_STATUS,
} from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import {
  CODEX_AGENT_ENVIRONMENT_ALLOWLIST,
  CODEX_AGENT_ENVIRONMENT_POLICY_VERSION,
  createCodexAgentRuntimePlan,
} from "../agentRunner/runtimeIsolation/index.mjs";
import { validateCodexAppServerPreflightEvidence } from "../preflight/index.mjs";
import {
  createCodexAgentAppServerArguments,
  createCodexRuntimeOverrides,
} from "../sessionFlags/index.mjs";

export function createCodexHostApprovalPacket(input) {
  const preflightEvidence = validateCodexAppServerPreflightEvidence(input.preflightEvidence, {
    codexExecutableDigest: input.state.identities.codex.digest,
    codexVersion: input.state.identities.codex.version,
  });
  const runtimeOverrides = createCodexRuntimeOverrides();
  const runtimePlan = createCodexAgentRuntimePlan({
    codexHomeSource: input.state.codex.homeSource,
    taskId: input.state.task.taskId,
    sourceStateDigest: input.state.stateDigest,
  });
  const environmentPolicy = {
    version: CODEX_AGENT_ENVIRONMENT_POLICY_VERSION,
    inheritedNames: [...CODEX_AGENT_ENVIRONMENT_ALLOWLIST],
    managedNames: [
      "CODEX_HOME",
      "CODEX_SQLITE_HOME",
      "TEMP",
      "TMP",
      "TMPDIR",
      "HOME",
      "USERPROFILE",
      "HOMEDRIVE",
      "HOMEPATH",
      "NO_UPDATE_NOTIFIER",
    ],
  };
  const worktreeRoot = resolve(input.artifacts.worktreeRoot);
  const absoluteWriteSet = input.state.fixedProject.writeSet.map((path) =>
    resolve(worktreeRoot, path),
  );
  const launchArguments = createCodexAgentAppServerArguments();
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
      absoluteWriteSet,
      historicalLogicChange: input.state.fixedProject.historicalLogicChange,
      targetSnapshot: {
        relativePath: input.state.fixedProject.writeSet[0],
        digest: input.state.activation.targetDigest,
      },
      worktree: input.worktreeIdentity,
    },
    codex: {
      executable: input.state.identities.codex,
      homeSource: input.state.codex.homeSource,
      userConfigLoaded: false,
      projectInstructionsLoaded: false,
    },
    harnessCli: input.state.identities.consumer,
    model: {
      id: input.state.model,
      reasoningEffort: REASONING_EFFORT,
      launchLimit: CODEX_MODEL_LAUNCH_LIMIT,
    },
    execution: {
      mode: CODEX_AGENT_EXECUTION_MODE.AppServerFileChangeApproval,
      protocol: "jsonl",
      reconnectAttempts: 0,
      retryAttempts: 0,
      provider: {
        id: CODEX_MODEL_PROVIDER_ID,
        ...CODEX_MODEL_PROVIDER,
      },
      runtimeOverrides,
    },
    actionControl: {
      kind: CODEX_ACTION_CONTROL_KIND.AppServerFileChangeApproval,
      permissionProfile: CODEX_PERMISSION_PROFILE.ReadOnly,
      approvalPolicy: CODEX_APPROVAL_POLICY.OnRequest,
      acceptedDecision: CODEX_FILE_CHANGE_DECISION.Accept,
      deniedDecision: CODEX_FILE_CHANGE_DECISION.Cancel,
      decisionScope: CODEX_FILE_CHANGE_DECISION_SCOPE.SingleRequest,
      grantRootAllowed: false,
      exactItemCorrelationRequired: true,
      allowedMutationSurfaces: [...CODEX_ALLOWED_MUTATION_SURFACES],
      allowedFileChangeKinds: [...CODEX_ALLOWED_FILE_CHANGE_KINDS],
      allowedAbsolutePaths: absoluteWriteSet,
    },
    runtimeIsolation: {
      plan: runtimePlan,
      planDigest: calculateDigest(runtimePlan),
      environmentPolicy: {
        ...environmentPolicy,
        digest: calculateDigest(environmentPolicy),
      },
      externalConfigAllowed: false,
      externalSkillsAllowed: false,
      externalMcpAllowed: false,
      credentialContentReadByHarness: false,
      cleanupRequiresConfirmedProcessExit: true,
    },
    prompt: {
      file: input.artifacts.promptFile,
      digest: input.state.activation.promptDigest,
      fixed: true,
      targetDigest: input.state.activation.targetDigest,
    },
    activation: {
      manifestFile: input.artifacts.manifestFile,
      sessionId: input.artifacts.manifest.sessionId,
      digest: calculateDigest(input.artifacts.manifest),
      result: input.state.activation.result,
    },
    compatibilityArtifacts: {
      candidateHooksFile: input.artifacts.candidateConfigFile,
      candidateHooksDigest: input.state.activation.candidateConfigDigest,
      enforcement: false,
      persistentWrites: 0,
    },
    preflight: {
      appServerProcesses: HOST_PREFLIGHT_PROCESS_COUNT,
      realModelRequests: HOST_PREFLIGHT_REAL_MODEL_REQUEST_COUNT,
      evidence: preflightEvidence,
      evidenceDigest: preflightEvidence.evidenceDigest,
    },
    launch: {
      executable: input.state.codex.executable,
      arguments: launchArguments,
      cwd: worktreeRoot,
      protocol: {
        thread: {
          model: input.state.model,
          modelProvider: CODEX_MODEL_PROVIDER_ID,
          cwd: worktreeRoot,
          ephemeral: true,
          approvalPolicy: CODEX_APPROVAL_POLICY.OnRequest,
          permissions: CODEX_PERMISSION_PROFILE.ReadOnly,
          runtimeWorkspaceRoots: [worktreeRoot],
        },
        turn: {
          approvalPolicy: CODEX_APPROVAL_POLICY.OnRequest,
          permissions: CODEX_PERMISSION_PROFILE.ReadOnly,
          runtimeWorkspaceRoots: [worktreeRoot],
        },
      },
      prompt: {
        kind: "file",
        file: input.artifacts.promptFile,
        digest: input.state.activation.promptDigest,
      },
      limits: {
        timeoutMs: CODEX_AGENT_TIMEOUT_MS,
        outputLimitBytes: CODEX_AGENT_OUTPUT_LIMIT_BYTES,
        stderrLimitBytes: CODEX_AGENT_STDERR_LIMIT_BYTES,
        terminationConfirmationTimeoutMs: CODEX_AGENT_TERMINATION_CONFIRMATION_TIMEOUT_MS,
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
      actionControlAcknowledged: true,
    },
    forbiddenActions: [...FORBIDDEN_ACTIONS],
    forbiddenFlags: [
      "--dangerously-bypass-hook-trust",
      "--dangerously-bypass-approvals-and-sandbox",
    ],
    forbiddenDecisions: ["acceptForSession"],
  };
  return { ...packet, packetDigest: calculateDigest(packet) };
}
