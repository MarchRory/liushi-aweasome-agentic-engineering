import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  AGENT_ACTOR_ID,
  ARTIFACT_TYPES,
  GATES,
  PACKAGE_MANAGER,
  PILOT_SCHEMA_VERSION,
  PROFILE_PROPOSAL_NAME,
  REPOSITORY_ID,
  REPOSITORY_REVISION,
  REPOSITORY_URL,
  SCAN_REPORT_NAME,
  SOTA_MODEL_ID,
  STATE_STATUS,
  TASK_SOURCE,
  WORKSPACE_ID,
  WRITE_SET,
} from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import {
  createPilotHarnessClient,
  createPilotProposalIdempotencyKey,
} from "../../harnessClient/index.mjs";
import { preparePublicProject } from "../../project/index.mjs";
import { appendState, createStateStore, writeControlJson } from "../../state/index.mjs";
import {
  requireExistingDirectory,
  requireExistingFile,
  requireNonexistentDirectory,
} from "../../validation/index.mjs";
import { createProjectProfileProposal } from "../../workflow/index.mjs";
import {
  capturePilotIdentities,
  createPilotDependencies,
  createPilotPaths,
  removeOwnedPilotRoot,
  requirePilotRecord,
  requirePilotString,
  validatePilotActor,
  validatePendingProposal,
} from "../shared/index.mjs";

export async function prepareCodexAgentPilot(input, overrides = {}) {
  const dependencies = createPilotDependencies(overrides);
  validatePilotActor(input.actorId);
  if (input.model !== SOTA_MODEL_ID) {
    throw new Error(`顶层 Agent 模型必须固定为 ${SOTA_MODEL_ID}。`);
  }
  const root = await requireNonexistentDirectory(input.root, "--root");
  const codexExecutable = await requireExistingFile(input.codex, "--codex");
  const codexHome = await requireExistingDirectory(input.codexHome, "--codex-home");
  await requireExistingFile(join(codexHome, "config.toml"), "--codex-home/config.toml");
  const codexVersion = dependencies.readCodexVersion(codexExecutable);
  let rootCreated = false;
  let succeeded = false;
  try {
    await mkdir(root);
    rootCreated = true;
    const paths = createPilotPaths(root);
    await Promise.all([
      mkdir(paths.controlRoot, { recursive: true }),
      mkdir(paths.runtimeRoot, { recursive: true }),
      mkdir(paths.stateRoot, { recursive: true }),
    ]);
    const project = await preparePublicProject(
      { root, controlRoot: paths.controlRoot, packageRoot: input.packageRoot },
      dependencies,
    );
    const consumer = createPilotHarnessClient({
      consumerRoot: project.consumerRoot,
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      source: TASK_SOURCE,
      runEnvelope: dependencies.runEnvelope,
    });
    const taskEnvelope = await consumer.createTask(input.actorId, paths.runtimeRoot);
    const taskId = requirePilotString(taskEnvelope.data?.taskId, "Task ID");
    const scanEnvelope = await consumer.scanProject(project.scanManifestFile);
    const report = scanEnvelope.data;
    if (report?.status !== "complete") throw new Error("固定公开项目扫描未完成。");
    const reportFile = join(paths.controlRoot, SCAN_REPORT_NAME);
    await writeControlJson(reportFile, report);
    const proposalFile = join(paths.controlRoot, PROFILE_PROPOSAL_NAME);
    await writeControlJson(proposalFile, createProjectProfileProposal(report));
    const proposed = await consumer.proposeArtifact(
      taskId,
      proposalFile,
      input.actorId,
      createPilotProposalIdempotencyKey(taskId, GATES.G8),
      paths.runtimeRoot,
    );
    const artifact = requirePilotRecord(proposed.data?.artifact, "ProjectProfile Artifact");
    const request = requirePilotRecord(proposed.data?.decisionRequest, "G8 DecisionRequest");
    if (request.gate !== GATES.G8) {
      throw new Error("ProjectProfile Proposal 必须只产生 G8。");
    }
    validatePendingProposal({
      artifact,
      request,
      expectedGate: GATES.G8,
      expectedArtifactType: ARTIFACT_TYPES.ProjectProfile,
    });
    const identities = await capturePilotIdentities({
      root,
      repositoryRoot: project.repositoryRoot,
      consumerRoot: project.consumerRoot,
      packageArtifact: project.packageArtifact,
      codexExecutable,
      codexVersion,
      codexHome,
      runGit: dependencies.runGit,
    });
    const stateStore = await createStateStore(paths.controlRoot);
    const appended = await appendState(stateStore.stateRoot, {
      pilotSchemaVersion: PILOT_SCHEMA_VERSION,
      status: STATE_STATUS.WaitingApproval,
      gate: GATES.G8,
      actor: { humanActorId: input.actorId, agentActorId: AGENT_ACTOR_ID },
      model: input.model,
      fixedProject: {
        repositoryId: REPOSITORY_ID,
        repositoryUrl: REPOSITORY_URL,
        revision: REPOSITORY_REVISION,
        packageManager: PACKAGE_MANAGER,
        writeSet: [...WRITE_SET],
        historicalLogicChange: false,
      },
      paths,
      codex: { executable: codexExecutable, homeSource: codexHome },
      identities,
      task: { workspaceId: WORKSPACE_ID, taskId, source: TASK_SOURCE },
      scan: {
        manifestFile: project.scanManifestFile,
        reportFile,
        reportDigest: calculateDigest(report),
      },
      proposal: { file: proposalFile, artifact, request },
      pendingDecisionRequest: request,
      approvals: [],
      gateEvaluations: [],
      effects: {
        approvalCount: 0,
        activationExecuted: false,
        hookWrites: 0,
        modelLaunches: 0,
      },
      generatedAt: dependencies.now(),
    });
    succeeded = true;
    return {
      status: appended.state.status,
      root,
      stateFile: appended.file,
      stateDigest: appended.state.stateDigest,
      pendingDecisionRequest: request,
      paths,
    };
  } catch (error) {
    if (rootCreated && !succeeded) await removeOwnedPilotRoot(root);
    throw error;
  }
}
