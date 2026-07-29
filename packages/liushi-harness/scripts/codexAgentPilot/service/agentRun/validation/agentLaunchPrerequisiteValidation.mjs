import { lstat, readFile, stat } from "node:fs/promises";

import {
  CODEX_APPROVAL_POLICY,
  CODEX_AGENT_OUTPUT_LIMIT_BYTES,
  CODEX_AGENT_STDERR_LIMIT_BYTES,
  CODEX_AGENT_TERMINATION_CONFIRMATION_TIMEOUT_MS,
  CODEX_AGENT_TIMEOUT_MS,
  CODEX_FILE_CHANGE_DECISION_SCOPE,
  CODEX_PERMISSION_PROFILE,
} from "../../../constants/index.mjs";
import {
  assertHostTargetSnapshotStable,
  readValidatedCodexHostApprovalPacket,
  readValidatedHostActivation,
} from "../../../host/index.mjs";
import { verifyPilotPaths } from "../../../project/index.mjs";
import {
  capturePilotWorktreeIdentity,
  validateStablePilotIdentities,
} from "../../shared/index.mjs";
import { calculateTextDigest } from "../../../digest/index.mjs";

export async function validateFreshLaunchPrerequisites(input) {
  await verifyPilotPaths(input.paths);
  await validateStablePilotIdentities(input.approvedState, input.dependencies);
  const artifacts = await readValidatedHostActivation(input.approvedState, input.paths);
  await assertHostTargetSnapshotStable(artifacts);
  const worktreeIdentity = capturePilotWorktreeIdentity(
    artifacts.worktreeRoot,
    input.dependencies.runGit,
  );
  const { packet } = await readValidatedCodexHostApprovalPacket({
    state: input.approvedState,
    packetState: input.packetState,
    packetDigest: input.packetDigest,
    controlRoot: input.paths.controlRoot,
    artifacts,
    worktreeIdentity,
  });
  if (
    packet.launch?.executed !== false ||
    packet.launch?.executable !== input.approvedState.codex.executable ||
    packet.launch?.cwd !== artifacts.worktreeRoot ||
    packet.launch?.prompt?.file !== artifacts.promptFile ||
    packet.launch?.prompt?.digest !== input.approvedState.activation.promptDigest ||
    packet.actionControl?.permissionProfile !== CODEX_PERMISSION_PROFILE.ReadOnly ||
    packet.actionControl?.approvalPolicy !== CODEX_APPROVAL_POLICY.OnRequest ||
    packet.actionControl?.decisionScope !== CODEX_FILE_CHANGE_DECISION_SCOPE.SingleRequest ||
    packet.runtimeIsolation?.plan?.sourceStateDigest !== input.packetState.stateDigest ||
    packet.launch?.limits?.timeoutMs !== CODEX_AGENT_TIMEOUT_MS ||
    packet.launch?.limits?.outputLimitBytes !== CODEX_AGENT_OUTPUT_LIMIT_BYTES ||
    packet.launch?.limits?.stderrLimitBytes !== CODEX_AGENT_STDERR_LIMIT_BYTES ||
    packet.launch?.limits?.terminationConfirmationTimeoutMs !==
      CODEX_AGENT_TERMINATION_CONFIRMATION_TIMEOUT_MS
  ) {
    throw new Error("Agent Launch Packet 与当前 Host Approval 不一致。");
  }
  return { artifacts, packet, worktreeIdentity };
}

export async function captureAgentLaunchBaseline(input) {
  const [source, metadata] = await Promise.all([
    readFile(input.artifacts.targetFile, "utf8"),
    stat(input.artifacts.targetFile),
  ]);
  const targetDigest = calculateTextDigest(source);
  const worktreeIdentity = capturePilotWorktreeIdentity(
    input.artifacts.worktreeRoot,
    input.dependencies.runGit,
  );
  if (
    targetDigest !== input.artifacts.targetDigest ||
    worktreeIdentity.revision !== input.expectedRevision ||
    worktreeIdentity.clean !== true
  ) {
    throw new Error("Agent 启动前 Worktree baseline 发生漂移。");
  }
  return {
    capturedAt: requireIsoTimestamp(input.capturedAt, "Agent baseline capturedAt"),
    target: {
      file: input.artifacts.targetFile,
      digest: targetDigest,
      size: metadata.size,
      modifiedAtMs: metadata.mtimeMs,
    },
    worktreeIdentity,
  };
}

export async function assertExecutionRecordAbsent(file) {
  if (await pathExists(file)) {
    throw new Error("Agent Execution Record 已存在，拒绝创建新的 Launch Intent。");
  }
}

export async function pathExists(file) {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function requireIsoTimestamp(value, label) {
  if (!isCanonicalTimestamp(value)) {
    throw new Error(`${label} 无效。`);
  }
  return value;
}

function isCanonicalTimestamp(value) {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
