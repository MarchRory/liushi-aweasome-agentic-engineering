import { access, readFile } from "node:fs/promises";
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
  CODEX_HOOK_TIMEOUT_SECONDS,
  CODEX_ALLOWED_AGENT_TOOLS,
  CODEX_RESTRICTED_RUNTIME_OVERRIDES,
} from "../constants/index.mjs";
import { calculateDigest, calculateTextDigest } from "../digest/index.mjs";
import {
  createOrReadControlJson,
  writeControlJsonIdempotent,
  writeControlTextIdempotent,
} from "../state/index.mjs";
import { createSessionActivationPayloads } from "./manifest/index.mjs";
import { createCodexAgentPrompt } from "./prompt/index.mjs";
import { validateSessionActivationManifest } from "./validation/index.mjs";

export function createSessionActivationManifest(input) {
  const codingTaskId = ulid();
  const sessionId = ulid();
  const correlationId = ulid();
  const actionId = ulid();
  const { createPayload, provisionPayload, startPayload } = createSessionActivationPayloads({
    ...input,
    codingTaskId,
    actionId,
  });
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
  let manifest = input.manifest;
  const shouldPersistProvidedManifest = manifest !== undefined && input.skipManifestWrite !== true;
  if (manifest === undefined) {
    const candidate = createSessionActivationManifest(input);
    manifest =
      input.skipManifestWrite === true
        ? candidate
        : (await createOrReadControlJson(input.manifestFile, candidate)).value;
  }
  validateSessionActivationManifest(manifest, input);
  if (shouldPersistProvidedManifest) {
    await writeControlJsonIdempotent(input.manifestFile, manifest);
  }
  await access(input.cliEntrypoint);
  const worktreeRoot = join(input.repositoryRoot, WORKTREE_RELATIVE_PATH);
  if (input.deferHostArtifacts === true) {
    return { manifest, manifestFile: input.manifestFile, worktreeRoot };
  }
  const targetFile = join(worktreeRoot, WRITE_SET[0]);
  const targetSource = await readFile(targetFile, "utf8");
  const targetDigest = calculateTextDigest(targetSource);
  const candidateConfig = createCandidateConfig({
    cliEntrypoint: input.cliEntrypoint,
    storeRoot: input.runtimeRoot,
  });
  const candidateConfigFile = join(input.controlRoot, CANDIDATE_CONFIG_NAME);
  await writeControlJsonIdempotent(candidateConfigFile, candidateConfig);
  const candidateConfigDigest = calculateDigest(candidateConfig);
  const prompt = createCodexAgentPrompt({
    worktreeRoot,
    model: input.model,
    taskId: input.taskId,
    targetSource,
    targetDigest,
  });
  const promptFile = join(input.controlRoot, AGENT_PROMPT_NAME);
  await writeControlTextIdempotent(promptFile, prompt);
  const promptDigest = calculateTextDigest(prompt);
  const hostPacket = {
    schemaVersion: PILOT_SCHEMA_VERSION,
    status: STATE_STATUS.WaitingHostApproval,
    project: {
      repositoryId: REPOSITORY_ID,
      repositoryRevision: REPOSITORY_REVISION,
      packageManager: PACKAGE_MANAGER,
      writeSet: [...WRITE_SET],
      targetSnapshot: {
        relativePath: WRITE_SET[0],
        digest: targetDigest,
      },
    },
    actor: { agentActorId: AGENT_ACTOR_ID, humanActorId: input.humanActorId },
    model: { id: input.model, reasoningEffort: REASONING_EFFORT },
    permissions: {
      sandbox: PERMISSION_MODE,
      approvalPolicy: APPROVAL_POLICY,
      ignoreUserConfig: true,
      ignoreRules: true,
      ephemeral: true,
      allowedTools: [...CODEX_ALLOWED_AGENT_TOOLS],
      runtimeOverrides: [...CODEX_RESTRICTED_RUNTIME_OVERRIDES],
    },
    paths: {
      controlRoot: input.controlRoot,
      runtimeRoot: input.runtimeRoot,
      repositoryRoot: input.repositoryRoot,
      consumerRoot: input.consumerRoot,
      worktreeRoot,
      candidateConfigFile,
      promptFile,
      targetFile,
    },
    candidateHooks: {
      file: candidateConfigFile,
      digest: candidateConfigDigest,
      writesExecuted: false,
      trustBypassAllowed: false,
    },
    agentPrompt: {
      file: promptFile,
      digest: promptDigest,
      fixed: true,
      targetDigest,
    },
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
  await writeControlJsonIdempotent(hostPacketFile, { ...hostPacket, activationDigest });
  return {
    manifest,
    manifestFile: input.manifestFile,
    candidateConfig,
    candidateConfigFile,
    candidateConfigDigest,
    promptFile,
    promptDigest,
    targetFile,
    targetDigest,
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
  const createHandler = (statusMessage) => ({
    type: "command",
    command: command.command,
    commandWindows: command.commandWindows,
    timeout: CODEX_HOOK_TIMEOUT_SECONDS,
    statusMessage,
  });
  return {
    hooks: {
      PreToolUse: [
        {
          matcher: "^apply_patch$",
          hooks: [createHandler("liushi Pilot 写入前策略检查")],
        },
      ],
      PostToolUse: [
        {
          matcher: "^apply_patch$",
          hooks: [createHandler("liushi Pilot 写入后证据记录")],
        },
      ],
    },
  };
}
