import { access } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { ulid } from "ulid";

import { createCodexHostHookCommands } from "../../codexHostSmoke/platform/index.mjs";
import {
  AGENT_ACTOR_ID,
  AGENT_PROMPT_NAME,
  COMMAND_TYPES,
  HOST_PACKET_NAME,
  PACKAGE_MANAGER,
  PERMISSION_MODE,
  APPROVAL_POLICY,
  PILOT_SCHEMA_VERSION,
  REASONING_EFFORT,
  REPOSITORY_ID,
  REPOSITORY_REVISION,
  STATE_STATUS,
  WORKTREE_RELATIVE_PATH,
  WRITE_SET,
  CANDIDATE_CONFIG_NAME,
  REQUIRED_HUMAN_ACTIONS,
  FORBIDDEN_ACTIONS,
} from "../constants/index.mjs";
import { calculateDigest, calculateTextDigest } from "../digest/index.mjs";
import { writeControlJson, writeControlText } from "../state/index.mjs";

export function createSessionActivationManifest(input) {
  const codingTaskId = ulid();
  const sessionId = ulid();
  const correlationId = ulid();
  const actionId = ulid();
  const createPayload = {
    workspaceId: input.workspaceId,
    sourceTaskId: input.taskId,
    repositoryId: REPOSITORY_ID,
    baseRevision: REPOSITORY_REVISION,
    worktreeBinding: {
      worktreeId: `codex-agent-pilot-${codingTaskId}`,
      relativePath: WORKTREE_RELATIVE_PATH,
      branchName: "codex/agent-pilot",
      managed: true,
    },
    writeSet: [...WRITE_SET],
    inputBindingSet: { bindings: [] },
    executionAuthorization: input.executionAuthorization,
  };
  const provisionPayload = {
    workspaceId: input.workspaceId,
    actionId,
    repositoryRootDigest: calculateDigest({ repositoryRoot: input.repositoryRoot }),
  };
  const startPayload = { workspaceId: input.workspaceId, attemptNumber: 1 };
  const createCommand = createEnvelope({
    commandId: ulid(),
    commandType: COMMAND_TYPES.Create,
    aggregateId: codingTaskId,
    expectedVersion: 0,
    correlationId,
    actorId: AGENT_ACTOR_ID,
    payload: createPayload,
  });
  const provisionCommand = createEnvelope({
    commandId: ulid(),
    commandType: COMMAND_TYPES.Provision,
    aggregateId: codingTaskId,
    expectedVersion: 1,
    correlationId,
    actorId: AGENT_ACTOR_ID,
    payload: provisionPayload,
  });
  const startAttemptCommand = createEnvelope({
    commandId: ulid(),
    commandType: COMMAND_TYPES.StartAttempt,
    aggregateId: codingTaskId,
    expectedVersion: 1,
    correlationId,
    actorId: AGENT_ACTOR_ID,
    payload: startPayload,
  });
  return {
    schemaVersion: "coding-task.session.activation.v1",
    sessionId,
    createCommand,
    provision: { command: provisionCommand, runtime: { repositoryRoot: input.repositoryRoot } },
    startAttemptCommand,
  };
}

export async function createActivationArtifacts(input) {
  const manifest = input.manifest ?? createSessionActivationManifest(input);
  if (input.skipManifestWrite !== true) {
    await writeControlJson(input.manifestFile, manifest);
  }
  await access(input.cliEntrypoint);
  const worktreeRoot = join(input.repositoryRoot, WORKTREE_RELATIVE_PATH);
  if (input.deferHostArtifacts === true) {
    return { manifest, manifestFile: input.manifestFile, worktreeRoot };
  }
  const candidateConfig = createCandidateConfig({
    cliEntrypoint: input.cliEntrypoint,
    storeRoot: input.runtimeRoot,
  });
  const candidateConfigFile = join(input.controlRoot, CANDIDATE_CONFIG_NAME);
  await writeControlJson(candidateConfigFile, candidateConfig);
  const candidateConfigDigest = calculateDigest(candidateConfig);
  const prompt = createAgentPrompt({ worktreeRoot, model: input.model, taskId: input.taskId });
  const promptFile = join(input.controlRoot, AGENT_PROMPT_NAME);
  await writeControlText(promptFile, prompt);
  const promptDigest = calculateTextDigest(prompt);
  const hostPacket = {
    schemaVersion: PILOT_SCHEMA_VERSION,
    status: STATE_STATUS.WaitingHostApproval,
    project: {
      repositoryId: REPOSITORY_ID,
      repositoryRevision: REPOSITORY_REVISION,
      packageManager: PACKAGE_MANAGER,
      writeSet: [...WRITE_SET],
    },
    actor: { agentActorId: AGENT_ACTOR_ID, humanActorId: input.humanActorId },
    model: { id: input.model, reasoningEffort: REASONING_EFFORT },
    permissions: {
      sandbox: PERMISSION_MODE,
      approvalPolicy: APPROVAL_POLICY,
      ignoreUserConfig: true,
      ignoreRules: true,
      ephemeral: true,
    },
    paths: {
      controlRoot: input.controlRoot,
      runtimeRoot: input.runtimeRoot,
      repositoryRoot: input.repositoryRoot,
      consumerRoot: input.consumerRoot,
      worktreeRoot,
      candidateConfigFile,
      promptFile,
    },
    candidateHooks: {
      file: candidateConfigFile,
      digest: candidateConfigDigest,
      writesExecuted: false,
      trustBypassAllowed: false,
    },
    agentPrompt: { file: promptFile, digest: promptDigest, fixed: true },
    activation: {
      manifestFile: input.manifestFile,
      sessionId: manifest.sessionId,
      digest: calculateDigest(manifest),
      executed: true,
    },
    host: {
      codexExecutable: {
        file: input.codexExecutable,
        digest: input.identities.codex.digest,
        version: input.identities.codex.version,
      },
      harnessCli: {
        file: input.identities.consumer.cliEntrypoint,
        digest: input.identities.consumer.cliEntrypointDigest,
      },
      codexHomeSource: input.codexHome,
      launchExecuted: false,
      trustWritten: false,
      hookBound: false,
    },
    requiredHumanActions: [...REQUIRED_HUMAN_ACTIONS],
    forbiddenActions: [...FORBIDDEN_ACTIONS],
  };
  const activationDigest = calculateDigest(hostPacket);
  const hostPacketFile = join(input.controlRoot, HOST_PACKET_NAME);
  await writeControlJson(hostPacketFile, { ...hostPacket, activationDigest });
  return {
    manifest,
    manifestFile: input.manifestFile,
    candidateConfig,
    candidateConfigFile,
    candidateConfigDigest,
    promptFile,
    promptDigest,
    hostPacketFile,
    hostPacket: { ...hostPacket, activationDigest },
    worktreeRoot,
    activationDigest,
  };
}

function createEnvelope(input) {
  return {
    schemaVersion: "1.0.0",
    commandId: input.commandId,
    commandType: input.commandType,
    aggregateType: "coding_task",
    aggregateId: input.aggregateId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.commandId,
    requestDigest: calculateDigest(input.payload),
    actor: { kind: "agent", actorId: input.actorId },
    authorizationContext: {},
    correlationId: input.correlationId,
    submittedAt: new Date().toISOString(),
    payload: input.payload,
  };
}

function createCandidateConfig(input) {
  const command = createCodexHostHookCommands({
    nodeExecutable: process.execPath,
    cliEntrypoint: input.cliEntrypoint,
    storeRoot: input.storeRoot,
  });
  const createHandler = () => ({
    type: "command",
    command: command.command,
    commandWindows: command.commandWindows,
    statusMessage: "liushi Codex Agent Pilot",
  });
  return {
    hooks: {
      PreToolUse: [
        {
          matcher: "^apply_patch$",
          hooks: [createHandler()],
        },
      ],
      PostToolUse: [
        {
          matcher: "^apply_patch$",
          hooks: [createHandler()],
        },
      ],
    },
  };
}

function createAgentPrompt(input) {
  return `你是固定审计 actor ${AGENT_ACTOR_ID}。在 ${input.worktreeRoot} 中只完成一项任务：仅修改 test/utils.test.ts，增加 module namespace object 回归测试：动态 import ../src/_utils，并断言 isPlainObject(namespace) 为 true。historicalLogicChange=false，Write Set 只有 test/utils.test.ts。不要修改 src/**、其他文件或 Codex Home；不要执行 Closeout、Completion 或任何超出受控 Session 的操作。模型 ${input.model} 仅在后续 Host 明确批准后启动。Task=${input.taskId}\n`;
}
