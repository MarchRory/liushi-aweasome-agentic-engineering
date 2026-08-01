import { join } from "node:path";

import { createActivationArtifacts } from "../../activation/index.mjs";
import {
  AGENT_ACTOR_ID,
  ARTIFACT_TYPES,
  GATES,
  PLAN_RISK_PROPOSAL_FILE_STEM,
  REQUIREMENT_PROPOSAL_NAME,
  SESSION_MANIFEST_NAME,
  STATE_STATUS,
} from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import {
  createPilotHarnessClient,
  createPilotProposalIdempotencyKey,
  resolvePilotCliEntrypoint,
} from "../../harnessClient/index.mjs";
import { verifyPilotPaths } from "../../project/index.mjs";
import { readControlJson, readStateChain, writeControlJsonIdempotent } from "../../state/index.mjs";
import { requireExistingDirectory } from "../../validation/index.mjs";
import { createPlanRiskProposal, createRequirementProposal } from "../../workflow/index.mjs";
import {
  capturePilotIdentitiesFromState,
  createExecutionAuthorization,
  createPilotDependencies,
  createPilotPaths,
  readCompiledProfile,
  requirePilotRecord,
  validateCurrentPilotState,
  validatePilotActor,
  validatePendingProposal,
  validateRecordedApproval,
} from "../shared/index.mjs";
import { resolveCompletedApprovalReplay } from "./replay/index.mjs";

export async function approveCodexAgentPilot(input, overrides = {}) {
  const dependencies = createPilotDependencies(overrides);
  validatePilotActor(input.actorId);
  const root = await requireExistingDirectory(input.root, "--root");
  const paths = createPilotPaths(root);
  const states = await readStateChain(paths.stateRoot);
  const current = states.at(-1);
  if (current.stateDigest !== input.stateDigest) {
    const replay = resolveCompletedApprovalReplay(states, input);
    if (replay !== undefined) return replay;
    throw new Error("stateDigest 不匹配。");
  }
  if (current.actor?.humanActorId !== input.actorId) throw new Error("Human actor 不匹配。");
  if (current.status === STATE_STATUS.WaitingHostApproval) {
    throw new Error("waiting_host_approval 已停止；禁止再次 approve 或启动进程。");
  }
  validateCurrentPilotState(current, paths);
  await verifyPilotPaths(paths);
  const identity = await capturePilotIdentitiesFromState(current, dependencies);
  if (calculateDigest(identity) !== calculateDigest(current.identities)) {
    throw new Error("路径、固定仓库、consumer、tarball 或 Codex executable identity 已漂移。");
  }
  const request = requirePilotRecord(current.pendingDecisionRequest, "pending DecisionRequest");
  const approvalIdempotencyKey = `codex-agent-pilot:${current.revision}:${request.decisionRequestId}`;
  const consumer = createPilotHarnessClient({
    consumerRoot: paths.consumerRoot,
    workspaceId: current.task.workspaceId,
    repositoryId: current.fixedProject.repositoryId,
    source: current.task.source,
    runEnvelope: dependencies.runEnvelope,
  });
  const approvalEnvelope = await consumer.approve(
    current.task.taskId,
    request,
    input.actorId,
    approvalIdempotencyKey,
    paths.runtimeRoot,
  );
  const approval = requirePilotRecord(approvalEnvelope.data?.approval, "Approval");
  const gateEvaluation = requirePilotRecord(
    approvalEnvelope.data?.gateEvaluation,
    "GateEvaluation",
  );
  validateRecordedApproval({
    request,
    artifact: current.proposal.artifact,
    approval,
    gateEvaluation,
    expectedActorId: input.actorId,
    expectedIdempotencyKey: approvalIdempotencyKey,
  });
  const approvedState = {
    ...current,
    approvals: [...current.approvals, approval],
    gateEvaluations: [...current.gateEvaluations, gateEvaluation],
    pendingDecisionRequest: null,
    effects: {
      ...current.effects,
      approvalCount: current.approvals.length + 1,
    },
    transition: {
      kind: "approval",
      sourceStateDigest: current.stateDigest,
      gate: current.gate,
      actorId: input.actorId,
      decisionRequestId: request.decisionRequestId,
      decisionRequestDigest: request.digest,
      idempotencyKey: approvalIdempotencyKey,
    },
  };
  const nextState = await progressApprovedGate({
    current,
    approvedState,
    approval,
    gateEvaluation,
    consumer,
    paths,
    actorId: input.actorId,
  });
  try {
    return (
      await dependencies.appendDerivedState(paths.stateRoot, nextState, {
        expectedPreviousStateDigest: current.stateDigest,
      })
    ).state;
  } catch (error) {
    const replay = resolveCompletedApprovalReplay(await readStateChain(paths.stateRoot), input);
    if (replay !== undefined) return replay;
    throw error;
  }
}

async function progressApprovedGate(input) {
  if (input.current.gate === GATES.G8) return progressG8(input);
  if (input.current.gate === GATES.G1) return progressG1(input);
  if (input.current.gate === GATES.G4) return progressG4(input);
  throw new Error("状态 Gate 无法推进。");
}

async function progressG8(input) {
  const report = await readControlJson(input.current.scan.reportFile);
  if (calculateDigest(report) !== input.current.scan.reportDigest) {
    throw new Error("Scan Report 摘要已漂移。");
  }
  const compiled = await input.consumer.compileProfile(
    input.current.task.taskId,
    input.current.proposal.artifact.artifactId,
    input.current.scan.reportFile,
    input.paths.runtimeRoot,
  );
  const requirementFile = join(input.paths.controlRoot, REQUIREMENT_PROPOSAL_NAME);
  await writeControlJsonIdempotent(
    requirementFile,
    createRequirementProposal(input.current.fixedProject),
  );
  const proposed = await input.consumer.proposeArtifact(
    input.current.task.taskId,
    requirementFile,
    input.actorId,
    createPilotProposalIdempotencyKey(input.current.task.taskId, GATES.G1),
    input.paths.runtimeRoot,
  );
  const requirementRequest = requirePilotRecord(
    proposed.data?.decisionRequest,
    "G1 DecisionRequest",
  );
  if (requirementRequest.gate !== GATES.G1) {
    throw new Error("Requirement Proposal 必须产生 G1。");
  }
  const requirementArtifact = requirePilotRecord(proposed.data?.artifact, "Requirement Artifact");
  validatePendingProposal({
    artifact: requirementArtifact,
    request: requirementRequest,
    expectedGate: GATES.G1,
    expectedArtifactType: ARTIFACT_TYPES.Requirement,
  });
  return {
    ...input.approvedState,
    status: STATE_STATUS.WaitingApproval,
    gate: GATES.G1,
    profile: {
      bundle: readCompiledProfile(compiled),
      reportDigest: calculateDigest(report),
    },
    proposal: {
      file: requirementFile,
      artifact: requirementArtifact,
      request: requirementRequest,
    },
    pendingDecisionRequest: requirementRequest,
  };
}

async function progressG1(input) {
  requirePilotRecord(input.current.profile?.bundle, "ProjectProfile Bundle");
  const planProposal = createPlanRiskProposal(input.current.fixedProject);
  const planProposalDigest = calculateDigest(planProposal).replace("sha256:", "");
  const planFile = join(
    input.paths.controlRoot,
    `${PLAN_RISK_PROPOSAL_FILE_STEM}.${planProposalDigest}.json`,
  );
  await writeControlJsonIdempotent(planFile, planProposal);
  const proposed = await input.consumer.proposeArtifact(
    input.current.task.taskId,
    planFile,
    input.actorId,
    createPilotProposalIdempotencyKey(input.current.task.taskId, GATES.G4),
    input.paths.runtimeRoot,
  );
  const planRequest = requirePilotRecord(proposed.data?.decisionRequest, "G4 DecisionRequest");
  if (planRequest.gate !== GATES.G4) throw new Error("PlanRisk Proposal 必须产生 G4。");
  const planArtifact = requirePilotRecord(proposed.data?.artifact, "PlanRisk Artifact");
  validatePendingProposal({
    artifact: planArtifact,
    request: planRequest,
    expectedGate: GATES.G4,
    expectedArtifactType: ARTIFACT_TYPES.PlanRisk,
  });
  return {
    ...input.approvedState,
    status: STATE_STATUS.WaitingApproval,
    gate: GATES.G4,
    proposal: {
      file: planFile,
      artifact: planArtifact,
      request: planRequest,
    },
    pendingDecisionRequest: planRequest,
  };
}

async function progressG4(input) {
  const executionAuthorization = createExecutionAuthorization({
    planArtifact: input.current.proposal.artifact,
    gateEvaluation: input.gateEvaluation,
    historicalLogicChange: input.current.fixedProject.historicalLogicChange,
  });
  const manifestFile = join(input.paths.controlRoot, SESSION_MANIFEST_NAME);
  const common = {
    controlRoot: input.paths.controlRoot,
    runtimeRoot: input.paths.runtimeRoot,
    repositoryRoot: input.paths.repositoryRoot,
    consumerRoot: input.paths.consumerRoot,
    manifestFile,
    taskId: input.current.task.taskId,
    workspaceId: input.current.task.workspaceId,
    repositoryId: input.current.fixedProject.repositoryId,
    repositoryRevision: input.current.fixedProject.revision,
    packageManager: input.current.fixedProject.packageManager,
    writeSet: input.current.fixedProject.writeSet,
    historicalLogicChange: input.current.fixedProject.historicalLogicChange,
    agentInstruction: input.current.fixedProject.agentInstruction,
    executionAuthorization,
    codexExecutable: input.current.codex.executable,
    codexHome: input.current.codex.homeSource,
    model: input.current.model,
    humanActorId: input.actorId,
    cliEntrypoint: resolvePilotCliEntrypoint(input.paths.consumerRoot),
    identities: input.current.identities,
  };
  const activationPreparation = await createActivationArtifacts({
    ...common,
    deferHostArtifacts: true,
  });
  const activated = await input.consumer.activateSession(
    manifestFile,
    input.paths.repositoryRoot,
    AGENT_ACTOR_ID,
    input.paths.runtimeRoot,
  );
  if (
    activated.data?.status !== "waiting_agent" &&
    activated.data?.status !== "waiting_for_agent"
  ) {
    throw new Error("Session Activation 未进入 waiting agent。");
  }
  const artifacts = await createActivationArtifacts({
    ...common,
    manifest: activationPreparation.manifest,
    skipManifestWrite: true,
  });
  return {
    ...input.approvedState,
    status: STATE_STATUS.WaitingHostApproval,
    gate: null,
    pendingDecisionRequest: null,
    executionAuthorization,
    activation: { ...artifacts, result: activated.data },
    effects: {
      approvalCount: input.approvedState.approvals.length,
      activationExecuted: true,
      hookWrites: 0,
      modelLaunches: 0,
    },
  };
}
