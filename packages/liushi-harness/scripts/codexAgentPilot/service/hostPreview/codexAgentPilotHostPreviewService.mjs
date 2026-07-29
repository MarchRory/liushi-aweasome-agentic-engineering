import { join } from "node:path";

import {
  HOST_APPROVAL_PACKET_PREFIX,
  HOST_PREFLIGHT_PROCESS_COUNT,
  STATE_STATUS,
} from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import {
  assertHostTargetSnapshotStable,
  createCodexHostApprovalPacket,
  readValidatedHostActivation,
} from "../../host/index.mjs";
import { verifyPilotPaths } from "../../project/index.mjs";
import {
  appendDerivedState,
  readStateChain,
  writeControlJsonIdempotent,
} from "../../state/index.mjs";
import { requireExistingDirectory } from "../../validation/index.mjs";
import {
  capturePilotWorktreeIdentity,
  createPilotDependencies,
  createPilotPaths,
  validatePilotActor,
  validateStablePilotIdentities,
  validateWaitingHostPilotState,
} from "../shared/index.mjs";

export async function previewCodexAgentPilotHost(input, overrides = {}) {
  const dependencies = createPilotDependencies(overrides);
  validatePilotActor(input.actorId);
  const root = await requireExistingDirectory(input.root, "--root");
  const paths = createPilotPaths(root);
  const states = await readStateChain(paths.stateRoot);
  const current = states.at(-1);
  if (current.stateDigest !== input.stateDigest) throw new Error("stateDigest 不匹配。");
  if (current.actor?.humanActorId !== input.actorId) throw new Error("Human actor 不匹配。");
  validateWaitingHostPilotState(current, paths);
  await verifyPilotPaths(paths);
  await validateStablePilotIdentities(current, dependencies);

  const artifacts = await readValidatedHostActivation(current, paths);
  await assertHostTargetSnapshotStable(artifacts);
  const worktreeIdentity = capturePilotWorktreeIdentity(
    artifacts.worktreeRoot,
    dependencies.runGit,
  );
  const preflightEvidence = await dependencies.probeCodexAppServerFileChangeApproval({
    executable: current.codex.executable,
    codexExecutableDigest: current.identities.codex.digest,
    codexVersion: current.identities.codex.version,
    model: current.model,
  });

  await validateStablePilotIdentities(current, dependencies);
  const finalArtifacts = await readValidatedHostActivation(current, paths);
  await assertHostTargetSnapshotStable(finalArtifacts);
  const finalWorktreeIdentity = capturePilotWorktreeIdentity(
    finalArtifacts.worktreeRoot,
    dependencies.runGit,
  );
  if (calculateDigest(worktreeIdentity) !== calculateDigest(finalWorktreeIdentity)) {
    throw new Error("Host 预检期间 Worktree identity 发生漂移。");
  }

  const packet = createCodexHostApprovalPacket({
    state: current,
    artifacts: finalArtifacts,
    worktreeIdentity: finalWorktreeIdentity,
    preflightEvidence,
  });
  const latestBeforeCommit = (await readStateChain(paths.stateRoot)).at(-1);
  if (latestBeforeCommit.stateDigest !== current.stateDigest) {
    throw new Error("Host 预检期间状态链已推进，拒绝提交审批包。");
  }
  const packetFile = join(
    paths.controlRoot,
    `${HOST_APPROVAL_PACKET_PREFIX}${packet.packetDigest.slice("sha256:".length)}.json`,
  );
  await writeControlJsonIdempotent(packetFile, packet);
  const appended = await appendDerivedState(
    paths.stateRoot,
    {
      ...current,
      status: STATE_STATUS.WaitingHostApproval,
      hostPreview: {
        packetFile,
        packetDigest: packet.packetDigest,
        packet,
      },
      pendingHostApproval: {
        packetDigest: packet.packetDigest,
        humanActorId: input.actorId,
        approved: false,
      },
      transition: {
        kind: "host_preview",
        sourceStateDigest: current.stateDigest,
        actorId: input.actorId,
        packetDigest: packet.packetDigest,
      },
      effects: {
        ...current.effects,
        hostPreflightProcesses: HOST_PREFLIGHT_PROCESS_COUNT,
        hookWrites: 0,
        modelLaunches: 0,
      },
    },
    { expectedPreviousStateDigest: current.stateDigest },
  );
  return {
    status: appended.state.status,
    stateFile: appended.file,
    stateDigest: appended.state.stateDigest,
    hostApprovalPacketFile: packetFile,
    hostApprovalPacketDigest: packet.packetDigest,
    pendingHostApproval: appended.state.pendingHostApproval,
  };
}
