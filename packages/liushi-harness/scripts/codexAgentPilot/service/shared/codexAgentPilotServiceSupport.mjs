import { rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { runProcess } from "../../../common/process/index.mjs";
import { createHarnessConsumer } from "../../../publicProjectSmoke/harnessClient/index.mjs";
import { calculateFileDigest } from "../../../publicProjectSmoke/digest/index.mjs";
import {
  CONSUMER_DIRECTORY,
  CONTROL_DIRECTORY,
  GATES,
  HOST_APPROVAL_DECISION,
  HOST_APPROVAL_RECORD_SCHEMA_VERSION,
  HOST_PREFLIGHT_PROCESS_COUNT,
  REPOSITORY_DIRECTORY,
  REPOSITORY_ID,
  REPOSITORY_REVISION,
  RUNTIME_DIRECTORY,
  WRITE_SET,
  STATE_STATUS,
} from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import { probeCodexAppServerFileChangeApproval } from "../../host/index.mjs";
import { readInstalledManifest } from "../../project/index.mjs";
import { appendDerivedState } from "../../state/index.mjs";
import { rejectLink } from "../../validation/index.mjs";

const defaultDependencies = Object.freeze({
  createHarnessConsumer,
  runProcess,
  calculateFileDigest,
  runGit,
  readCodexVersion,
  probeCodexAppServerFileChangeApproval,
  appendDerivedState,
  now: () => new Date().toISOString(),
});

export function createPilotDependencies(overrides) {
  return { ...defaultDependencies, ...overrides };
}

export function createPilotPaths(root) {
  return {
    root,
    controlRoot: join(root, CONTROL_DIRECTORY),
    stateRoot: join(root, CONTROL_DIRECTORY, "state"),
    runtimeRoot: join(root, RUNTIME_DIRECTORY),
    repositoryRoot: join(root, REPOSITORY_DIRECTORY),
    consumerRoot: join(root, CONSUMER_DIRECTORY),
  };
}

export function validatePilotActor(actorId) {
  if (
    typeof actorId !== "string" ||
    actorId.length === 0 ||
    actorId !== actorId.trim() ||
    [...actorId].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error("actor-id 必须是可审计的非空字符串。");
  }
}

export function requirePilotString(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    value.includes("\0")
  ) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}

export function requirePilotRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}

export function readCompiledProfile(envelope) {
  if (envelope?.status !== "success" || envelope.data === undefined) {
    throw new Error("ProjectProfile compile 未成功。");
  }
  return envelope.data;
}

export async function capturePilotIdentities(input) {
  const repository = captureRepositoryIdentity(input.repositoryRoot, input.runGit);
  const manifest = await readInstalledManifest(input.consumerRoot);
  const tarball = join(input.root, "pack", input.packageArtifact.fileName);
  const cliEntrypoint = resolveInstalledCliEntrypoint(input.consumerRoot);
  return {
    repository,
    consumer: {
      root: input.consumerRoot,
      manifestDigest: calculateDigest(manifest),
      cliEntrypoint,
      cliEntrypointDigest: await calculateFileDigest(cliEntrypoint),
    },
    tarball: { file: tarball, digest: await calculateFileDigest(tarball) },
    codex: {
      file: input.codexExecutable,
      digest: await calculateFileDigest(input.codexExecutable),
      version: input.codexVersion,
    },
    codexHome: { root: input.codexHome, configFile: join(input.codexHome, "config.toml") },
  };
}

export async function capturePilotIdentitiesFromState(state, dependencies) {
  const repository = captureRepositoryIdentity(state.paths.repositoryRoot, dependencies.runGit);
  const manifest = await readInstalledManifest(state.paths.consumerRoot);
  const cliEntrypoint = resolveInstalledCliEntrypoint(state.paths.consumerRoot);
  return {
    repository,
    consumer: {
      root: state.paths.consumerRoot,
      manifestDigest: calculateDigest(manifest),
      cliEntrypoint,
      cliEntrypointDigest: await dependencies.calculateFileDigest(cliEntrypoint),
    },
    tarball: {
      file: state.identities.tarball.file,
      digest: await dependencies.calculateFileDigest(state.identities.tarball.file),
    },
    codex: {
      file: state.codex.executable,
      digest: await dependencies.calculateFileDigest(state.codex.executable),
      version: dependencies.readCodexVersion(state.codex.executable),
    },
    codexHome: {
      root: state.codex.homeSource,
      configFile: join(state.codex.homeSource, "config.toml"),
    },
  };
}

export async function validateStablePilotIdentities(state, dependencies) {
  const identity = await capturePilotIdentitiesFromState(state, dependencies);
  if (calculateDigest(identity) !== calculateDigest(state.identities)) {
    throw new Error("Pilot identity 发生漂移。");
  }
}

export function validateCurrentPilotState(state, paths) {
  if (
    state.paths?.root !== paths.root ||
    state.fixedProject?.repositoryId !== REPOSITORY_ID ||
    state.fixedProject?.revision !== REPOSITORY_REVISION ||
    JSON.stringify(state.fixedProject.writeSet) !== JSON.stringify(WRITE_SET)
  ) {
    throw new Error("固定项目或状态路径绑定无效。");
  }
  if (!Object.values(GATES).includes(state.gate)) {
    throw new Error("当前状态 Gate 无效。");
  }
  if (!state.pendingDecisionRequest || !state.proposal?.artifact || !state.proposal?.request) {
    throw new Error("当前状态必须只有一个 pending DecisionRequest。");
  }
  if (
    state.proposal.request.decisionRequestId !== state.pendingDecisionRequest.decisionRequestId ||
    state.proposal.request.digest !== state.pendingDecisionRequest.digest ||
    state.proposal.request.gate !== state.pendingDecisionRequest.gate ||
    state.pendingDecisionRequest.gate !== state.gate
  ) {
    throw new Error("当前状态的 Gate 或 pending DecisionRequest 绑定不一致。");
  }
  validatePendingProposal({
    artifact: state.proposal.artifact,
    request: state.proposal.request,
    expectedGate: state.gate,
  });
}

export function validateWaitingHostPilotState(state, paths) {
  if (
    state.status !== STATE_STATUS.WaitingHostApproval ||
    state.gate !== null ||
    state.pendingDecisionRequest !== null ||
    state.paths?.root !== paths.root ||
    state.fixedProject?.repositoryId !== REPOSITORY_ID ||
    state.fixedProject?.revision !== REPOSITORY_REVISION ||
    JSON.stringify(state.fixedProject.writeSet) !== JSON.stringify(WRITE_SET) ||
    state.fixedProject.historicalLogicChange !== false ||
    !["waiting_agent", "waiting_for_agent"].includes(state.activation?.result?.status) ||
    state.effects?.activationExecuted !== true ||
    state.effects?.hookWrites !== 0 ||
    state.effects?.modelLaunches !== 0 ||
    state.hostPreview !== undefined
  ) {
    throw new Error("当前状态不是可预检的 waiting_host_approval。");
  }
}

export function validatePendingHostApprovalPilotState(state, paths) {
  if (
    state.status !== STATE_STATUS.WaitingHostApproval ||
    state.gate !== null ||
    state.pendingDecisionRequest !== null ||
    state.paths?.root !== paths.root ||
    state.fixedProject?.repositoryId !== REPOSITORY_ID ||
    state.fixedProject?.revision !== REPOSITORY_REVISION ||
    JSON.stringify(state.fixedProject.writeSet) !== JSON.stringify(WRITE_SET) ||
    state.fixedProject.historicalLogicChange !== false ||
    !["waiting_agent", "waiting_for_agent"].includes(state.activation?.result?.status) ||
    state.effects?.activationExecuted !== true ||
    state.effects?.hostPreflightProcesses !== HOST_PREFLIGHT_PROCESS_COUNT ||
    state.effects?.hookWrites !== 0 ||
    state.effects?.modelLaunches !== 0 ||
    state.hostPreview?.packetDigest !== state.pendingHostApproval?.packetDigest ||
    state.hostPreview?.packet?.packetDigest !== state.pendingHostApproval?.packetDigest ||
    state.pendingHostApproval?.humanActorId !== state.actor?.humanActorId ||
    state.pendingHostApproval?.approved !== false ||
    state.transition?.kind !== "host_preview" ||
    state.transition?.sourceStateDigest !== state.previousStateDigest ||
    state.transition?.packetDigest !== state.pendingHostApproval.packetDigest ||
    state.transition?.actorId !== state.actor.humanActorId ||
    state.hostPreview.packet?.basedOn?.stateDigest !== state.transition.sourceStateDigest
  ) {
    throw new Error("当前状态不是可审批的 pending Host Approval。");
  }
}

export function validateHostApprovedPilotState(state, paths) {
  const approval = state.hostApproval;
  const { approvalDigest, ...approvalBody } =
    approval !== null && typeof approval === "object" && !Array.isArray(approval) ? approval : {};
  if (
    state.status !== STATE_STATUS.HostApproved ||
    state.gate !== null ||
    state.pendingDecisionRequest !== null ||
    state.paths?.root !== paths.root ||
    state.pendingHostApproval?.approved !== true ||
    state.pendingHostApproval?.approvalDigest !== approvalDigest ||
    state.pendingHostApproval?.packetDigest !== approvalBody.packetDigest ||
    state.hostPreview?.packetDigest !== approvalBody.packetDigest ||
    approvalBody.schemaVersion !== HOST_APPROVAL_RECORD_SCHEMA_VERSION ||
    approvalBody.decision !== HOST_APPROVAL_DECISION.Approved ||
    approvalBody.sourceStateDigest !== state.previousStateDigest ||
    approvalBody.activationDigest !== state.activation?.activationDigest ||
    approvalBody.actor?.kind !== "human" ||
    approvalBody.actor?.actorId !== state.actor?.humanActorId ||
    !isCanonicalIsoTimestamp(approvalBody.approvedAt) ||
    approvalBody.freshLaunchValidationRequired !== true ||
    calculateDigest(approvalBody) !== approvalDigest ||
    state.transition?.kind !== "host_approval" ||
    state.transition?.sourceStateDigest !== approvalBody.sourceStateDigest ||
    state.transition?.packetDigest !== approvalBody.packetDigest ||
    state.transition?.actorId !== approvalBody.actor.actorId ||
    state.transition?.approvalDigest !== approvalDigest ||
    state.effects?.activationExecuted !== true ||
    state.effects?.hostPreflightProcesses !== HOST_PREFLIGHT_PROCESS_COUNT ||
    state.effects?.hookWrites !== 0 ||
    state.effects?.modelLaunches !== 0
  ) {
    throw new Error("当前状态不是可启动 Agent 的 Host Approved 状态。");
  }
}

export function capturePilotWorktreeIdentity(worktreeRoot, runGitCommand) {
  return captureRepositoryIdentity(worktreeRoot, runGitCommand);
}

export function validateRecordedApproval(input) {
  if (
    input.approval.decision !== "approved" ||
    input.approval.decisionRequestId !== input.request.decisionRequestId ||
    input.approval.decisionRequestDigest !== input.request.digest ||
    input.approval.gate !== input.request.gate ||
    input.approval.artifactId !== input.artifact.artifactId ||
    input.approval.artifactDigest !== input.artifact.digest ||
    input.approval.actor?.kind !== "human" ||
    input.approval.actor?.actorId !== input.expectedActorId ||
    input.approval.idempotencyKey !== input.expectedIdempotencyKey
  ) {
    throw new Error("Approval 未绑定当前 DecisionRequest 与 Artifact。");
  }
  if (
    input.gateEvaluation.result !== "allow" ||
    input.gateEvaluation.artifactId !== input.artifact.artifactId ||
    input.gateEvaluation.artifactDigest !== input.artifact.digest ||
    !Array.isArray(input.gateEvaluation.requiredGates) ||
    !input.gateEvaluation.requiredGates.includes(input.request.gate) ||
    !Array.isArray(input.gateEvaluation.satisfiedApprovals) ||
    !input.gateEvaluation.satisfiedApprovals.includes(input.approval.approvalId)
  ) {
    throw new Error("GateEvaluation 未由当前 Approval 形成 allow。");
  }
}

export function validatePendingProposal(input) {
  if (
    input.request.gate !== input.expectedGate ||
    input.request.artifactId !== input.artifact.artifactId ||
    input.request.artifactDigest !== input.artifact.digest ||
    (input.expectedArtifactType !== undefined &&
      input.artifact.artifactType !== input.expectedArtifactType)
  ) {
    throw new Error("Artifact 与 DecisionRequest 绑定不一致。");
  }
}

export function createExecutionAuthorization(input) {
  return {
    planRisk: {
      artifactId: input.planArtifact.artifactId,
      artifactDigest: input.planArtifact.digest,
      result: "allow",
      requiredGates: input.gateEvaluation.requiredGates ?? [],
      satisfiedApprovalIds: input.gateEvaluation.satisfiedApprovals,
    },
    historicalLogicChange: false,
  };
}

export async function removeOwnedPilotRoot(root) {
  await rejectLink(root, "Prepare Root");
  const metadata = await stat(root);
  if (!metadata.isDirectory() || dirname(resolve(root)) === resolve(root)) {
    throw new Error("拒绝清理无法证明由本次 Prepare 创建的 Root。");
  }
  await rm(root, { recursive: true, force: true });
}

function runGit(cwd, args) {
  return runProcess("git", args, {
    cwd,
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  }).stdout.trim();
}

function readCodexVersion(executable) {
  const version = runProcess(executable, ["--version"], {
    timeout: 30000,
    maxBuffer: 64 * 1024,
  }).stdout.trim();
  return requirePilotString(version, "Codex version");
}

function captureRepositoryIdentity(repositoryRoot, runGitCommand) {
  const revision = runGitCommand(repositoryRoot, ["rev-parse", "HEAD"]);
  if (revision !== REPOSITORY_REVISION) throw new Error("固定仓库 revision 不匹配。");
  const status = runGitCommand(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (status !== "") throw new Error("固定仓库工作区必须保持 clean。");
  return { root: repositoryRoot, revision, clean: true };
}

function resolveInstalledCliEntrypoint(consumerRoot) {
  return join(
    consumerRoot,
    "node_modules",
    "liushi-harness",
    "dist",
    "bootstrap",
    "cli",
    "cliEntrypoint.js",
  );
}

function isCanonicalIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
