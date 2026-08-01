import {
  HOST_APPROVAL_DECISION,
  HOST_APPROVAL_RECORD_SCHEMA_VERSION,
  STATE_STATUS,
} from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import {
  assertHostTargetSnapshotStable,
  readValidatedCodexHostApprovalPacket,
  readValidatedHostActivation,
} from "../../host/index.mjs";
import { verifyPilotPaths } from "../../project/index.mjs";
import { readStateChain } from "../../state/index.mjs";
import { requireExistingDirectory } from "../../validation/index.mjs";
import {
  capturePilotWorktreeIdentity,
  createPilotDependencies,
  createPilotPaths,
  requirePilotString,
  validatePendingHostApprovalPilotState,
  validatePilotActor,
  validateStablePilotIdentities,
  validateWaitingHostPilotState,
} from "../shared/index.mjs";

export async function approveCodexAgentPilotHost(input, overrides = {}) {
  const dependencies = createPilotDependencies(overrides);
  validatePilotActor(input.actorId);
  requirePilotString(input.stateDigest, "stateDigest");
  requirePilotString(input.packetDigest, "packetDigest");
  const root = await requireExistingDirectory(input.root, "--root");
  const paths = createPilotPaths(root);
  const states = await readStateChain(paths.stateRoot);
  const current = states.at(-1);
  if (current.stateDigest !== input.stateDigest) {
    return resolveHostApprovalReplay(states, input);
  }
  validatePendingHostApprovalPilotState(current, paths);
  const packetState = states.at(-2);
  if (
    packetState?.stateDigest !== current.transition.sourceStateDigest ||
    current.previousStateDigest !== packetState.stateDigest
  ) {
    throw new Error("Host Preview 来源状态无效。");
  }
  validateWaitingHostPilotState(packetState, paths);
  if (
    current.actor?.humanActorId !== input.actorId ||
    current.pendingHostApproval.humanActorId !== input.actorId
  ) {
    throw new Error("Host Approval Human actor 不匹配。");
  }
  if (current.pendingHostApproval.packetDigest !== input.packetDigest) {
    throw new Error("Host Approval packetDigest 不匹配。");
  }

  await verifyPilotPaths(paths);
  await validateStablePilotIdentities(current, dependencies);
  const artifacts = await readValidatedHostActivation(current, paths);
  await assertHostTargetSnapshotStable(artifacts);
  const worktreeIdentity = capturePilotWorktreeIdentity(
    artifacts.worktreeRoot,
    dependencies.runGit,
    current.fixedProject.revision,
  );
  await readValidatedCodexHostApprovalPacket({
    state: current,
    packetState,
    packetDigest: input.packetDigest,
    controlRoot: paths.controlRoot,
    artifacts,
    worktreeIdentity,
  });

  const latest = (await readStateChain(paths.stateRoot)).at(-1);
  if (latest.stateDigest !== current.stateDigest) {
    throw new Error("Host Approval 校验期间状态链已推进。");
  }
  const approvedAt = requireIsoTimestamp(dependencies.now());
  const approvalBody = {
    schemaVersion: HOST_APPROVAL_RECORD_SCHEMA_VERSION,
    decision: HOST_APPROVAL_DECISION.Approved,
    sourceStateDigest: current.stateDigest,
    packetDigest: input.packetDigest,
    activationDigest: current.activation.activationDigest,
    actor: { kind: "human", actorId: input.actorId },
    approvedAt,
    freshLaunchValidationRequired: true,
  };
  const hostApproval = {
    ...approvalBody,
    approvalDigest: calculateDigest(approvalBody),
  };
  const appended = await dependencies.appendDerivedState(
    paths.stateRoot,
    {
      ...current,
      status: STATE_STATUS.HostApproved,
      pendingHostApproval: {
        ...current.pendingHostApproval,
        approved: true,
        approvalDigest: hostApproval.approvalDigest,
      },
      hostApproval,
      transition: {
        kind: "host_approval",
        sourceStateDigest: current.stateDigest,
        actorId: input.actorId,
        packetDigest: input.packetDigest,
        approvalDigest: hostApproval.approvalDigest,
      },
      effects: {
        ...current.effects,
        hookWrites: 0,
        modelLaunches: 0,
      },
    },
    { expectedPreviousStateDigest: current.stateDigest },
  );
  return projectResult(appended.state, appended.file, false);
}

function resolveHostApprovalReplay(states, input) {
  const replay = states.find(
    (state) => state.hostApproval?.sourceStateDigest === input.stateDigest,
  );
  if (replay === undefined) throw new Error("stateDigest 不匹配。");
  if (
    replay.hostApproval.packetDigest !== input.packetDigest ||
    replay.hostApproval.actor?.actorId !== input.actorId ||
    replay.hostApproval.decision !== HOST_APPROVAL_DECISION.Approved
  ) {
    throw new Error("Host Approval 重放身份冲突。");
  }
  return projectResult(replay, undefined, true);
}

function projectResult(state, stateFile, replayed) {
  return {
    status: state.status,
    revision: state.revision,
    stateFile,
    stateDigest: state.stateDigest,
    hostApproval: state.hostApproval,
    replayed,
  };
}

function requireIsoTimestamp(value) {
  if (
    typeof value !== "string" ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error("Host Approval approvedAt 无效。");
  }
  return value;
}
