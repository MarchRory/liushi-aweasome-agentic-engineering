import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createCodexAgentPrompt } from "../../activation/prompt/index.mjs";
import { validateSessionActivationManifest } from "../../activation/validation/index.mjs";
import {
  AGENT_PROMPT_NAME,
  APPROVAL_POLICY,
  CANDIDATE_CONFIG_NAME,
  CODEX_ALLOWED_AGENT_TOOLS,
  CODEX_RESTRICTED_RUNTIME_OVERRIDES,
  HOST_PACKET_NAME,
  PERMISSION_MODE,
  REASONING_EFFORT,
  SOTA_MODEL_ID,
  STATE_STATUS,
  WRITE_SET,
} from "../../constants/index.mjs";
import { calculateDigest, calculateTextDigest } from "../../digest/index.mjs";
import { readControlJson } from "../../state/index.mjs";
import { requireExistingDirectory, requireExistingFile } from "../../validation/index.mjs";

export async function readValidatedHostActivation(state, paths) {
  const activation = requireRecord(state.activation, "Session Activation");
  const worktreeRoot = await requireExistingDirectory(activation.worktreeRoot, "Pilot Worktree");
  const expectedFiles = {
    candidateConfigFile: join(paths.controlRoot, CANDIDATE_CONFIG_NAME),
    promptFile: join(paths.controlRoot, AGENT_PROMPT_NAME),
    hostPacketFile: join(paths.controlRoot, HOST_PACKET_NAME),
    manifestFile: activation.manifestFile,
    targetFile: join(worktreeRoot, WRITE_SET[0]),
  };
  for (const [name, file] of Object.entries(expectedFiles)) {
    await requireExistingFile(file, name);
  }
  const [candidateConfig, prompt, hostPacket, manifest, targetSource] = await Promise.all([
    readControlJson(expectedFiles.candidateConfigFile),
    readFile(expectedFiles.promptFile, "utf8"),
    readControlJson(expectedFiles.hostPacketFile),
    readControlJson(expectedFiles.manifestFile),
    readFile(expectedFiles.targetFile, "utf8"),
  ]);

  validateSessionActivationManifest(manifest, {
    workspaceId: state.task.workspaceId,
    taskId: state.task.taskId,
    repositoryRoot: paths.repositoryRoot,
    executionAuthorization: state.executionAuthorization,
  });
  validateActivationPaths(activation, expectedFiles, worktreeRoot);
  validateArtifactDigests({
    state,
    activation,
    candidateConfig,
    prompt,
    hostPacket,
    manifest,
    targetSource,
    worktreeRoot,
  });
  validatePreliminaryHostPacket({
    state,
    hostPacket,
    worktreeRoot,
    expectedFiles,
  });
  return {
    candidateConfig,
    prompt,
    hostPacket,
    manifest,
    targetSource,
    targetDigest: activation.targetDigest,
    worktreeRoot,
    ...expectedFiles,
  };
}

export async function assertHostTargetSnapshotStable(artifacts) {
  await requireExistingFile(artifacts.targetFile, "目标文件快照");
  const targetSource = await readFile(artifacts.targetFile, "utf8");
  if (calculateTextDigest(targetSource) !== artifacts.targetDigest) {
    throw new Error("目标文件快照摘要发生漂移。");
  }
}

function validateActivationPaths(activation, expectedFiles, worktreeRoot) {
  if (
    resolve(activation.candidateConfigFile) !== resolve(expectedFiles.candidateConfigFile) ||
    resolve(activation.promptFile) !== resolve(expectedFiles.promptFile) ||
    resolve(activation.hostPacketFile) !== resolve(expectedFiles.hostPacketFile) ||
    resolve(activation.manifestFile) !== resolve(expectedFiles.manifestFile) ||
    resolve(activation.targetFile) !== resolve(expectedFiles.targetFile) ||
    resolve(activation.worktreeRoot) !== resolve(worktreeRoot)
  ) {
    throw new Error("Session Activation 文件或 Worktree 路径发生漂移。");
  }
}

function validateArtifactDigests(input) {
  const { activationDigest, ...hostPacketBody } = input.hostPacket;
  if (calculateTextDigest(input.targetSource) !== input.activation.targetDigest) {
    throw new Error("目标文件快照摘要发生漂移。");
  }
  const expectedPrompt = createCodexAgentPrompt({
    worktreeRoot: input.worktreeRoot,
    model: input.state.model,
    taskId: input.state.task.taskId,
    targetSource: input.targetSource,
    targetDigest: input.activation.targetDigest,
  });
  if (input.prompt !== expectedPrompt) {
    throw new Error("Agent Prompt 未精确绑定目标文件快照。");
  }
  if (
    calculateDigest(input.candidateConfig) !== input.activation.candidateConfigDigest ||
    calculateTextDigest(input.prompt) !== input.activation.promptDigest ||
    calculateDigest(input.manifest) !== input.activation.hostPacket?.activation?.digest ||
    calculateDigest(input.manifest) !== input.hostPacket.activation?.digest ||
    calculateDigest(hostPacketBody) !== activationDigest ||
    activationDigest !== input.activation.activationDigest ||
    calculateDigest(input.hostPacket) !== calculateDigest(input.activation.hostPacket) ||
    calculateDigest(input.manifest) !== calculateDigest(input.activation.manifest)
  ) {
    throw new Error("Session Activation Artifact 摘要发生漂移。");
  }
}

function validatePreliminaryHostPacket(input) {
  const packet = input.hostPacket;
  if (
    packet.status !== STATE_STATUS.WaitingHostApproval ||
    packet.model?.id !== SOTA_MODEL_ID ||
    packet.model?.id !== input.state.model ||
    packet.model?.reasoningEffort !== REASONING_EFFORT ||
    packet.permissions?.sandbox !== PERMISSION_MODE ||
    packet.permissions?.approvalPolicy !== APPROVAL_POLICY ||
    packet.permissions?.ignoreUserConfig !== true ||
    packet.permissions?.ignoreRules !== true ||
    packet.permissions?.ephemeral !== true ||
    !equalStringArrays(packet.permissions?.allowedTools, CODEX_ALLOWED_AGENT_TOOLS) ||
    !equalStringArrays(packet.permissions?.runtimeOverrides, CODEX_RESTRICTED_RUNTIME_OVERRIDES) ||
    resolve(packet.paths?.worktreeRoot) !== resolve(input.worktreeRoot) ||
    resolve(packet.paths?.candidateConfigFile) !==
      resolve(input.expectedFiles.candidateConfigFile) ||
    resolve(packet.paths?.promptFile) !== resolve(input.expectedFiles.promptFile) ||
    resolve(packet.paths?.targetFile) !== resolve(input.expectedFiles.targetFile) ||
    packet.project?.targetSnapshot?.relativePath !== WRITE_SET[0] ||
    packet.project?.targetSnapshot?.digest !== input.state.activation.targetDigest ||
    packet.candidateHooks?.digest !== input.state.activation.candidateConfigDigest ||
    packet.candidateHooks?.writesExecuted !== false ||
    packet.candidateHooks?.trustBypassAllowed !== false ||
    packet.agentPrompt?.digest !== input.state.activation.promptDigest ||
    packet.agentPrompt?.targetDigest !== input.state.activation.targetDigest ||
    packet.host?.codexExecutable?.digest !== input.state.identities.codex.digest ||
    packet.host?.codexExecutable?.version !== input.state.identities.codex.version ||
    packet.host?.harnessCli?.digest !== input.state.identities.consumer.cliEntrypointDigest ||
    packet.host?.codexHomeSource !== input.state.codex.homeSource ||
    packet.host?.launchExecuted !== false ||
    packet.host?.trustWritten !== false ||
    packet.host?.hookBound !== false
  ) {
    throw new Error("Preliminary Host Activation Packet 未精确绑定当前状态。");
  }
}

function equalStringArrays(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}
