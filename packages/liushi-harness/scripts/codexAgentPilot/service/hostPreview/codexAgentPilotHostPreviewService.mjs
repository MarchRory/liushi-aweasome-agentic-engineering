import { chmod, lstat, mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

import {
  CODEX_HOOK_TRUST_STATUS,
  HOST_APPROVAL_PACKET_PREFIX,
  HOST_PREFLIGHT_PROCESS_COUNT,
  STATE_STATUS,
} from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import {
  assertHostTargetSnapshotStable,
  createCodexAppServerArguments,
  createCodexHostApprovalPacket,
  createHookDeclarationOverrides,
  createHookTrustOverride,
  readValidatedHostActivation,
  validateCodexHookProbe,
  validateStableHookIdentity,
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
  validateStablePilotIdentities,
  validatePilotActor,
  validateWaitingHostPilotState,
} from "../shared/index.mjs";

const TEMPORARY_HOME_PREFIX = "liushi-codex-host-preview-";

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
  const worktreeIdentity = capturePilotWorktreeIdentity(
    artifacts.worktreeRoot,
    dependencies.runGit,
  );
  const hookDeclarationOverrides = createHookDeclarationOverrides(artifacts.candidateConfig);

  const temporaryRoot = await mkdtemp(join(tmpdir(), TEMPORARY_HOME_PREFIX));
  const temporaryCodexHome = join(temporaryRoot, "home");
  let untrustedHooks;
  let trustedHooks;
  let hookTrustOverride;
  let preserveTemporaryHome = false;
  try {
    await chmod(temporaryRoot, 0o700);
    await mkdir(temporaryCodexHome, { mode: 0o700 });
    await assertHostTargetSnapshotStable(artifacts);
    const untrustedProbe = await dependencies.inspectCodexHooks({
      executable: current.codex.executable,
      arguments: createCodexAppServerArguments(hookDeclarationOverrides),
      cwd: artifacts.worktreeRoot,
      codexHome: temporaryCodexHome,
    });
    untrustedHooks = validateCodexHookProbe({
      probe: untrustedProbe,
      candidateConfig: artifacts.candidateConfig,
      cwd: artifacts.worktreeRoot,
      codexHome: temporaryCodexHome,
      expectedTrustStatus: CODEX_HOOK_TRUST_STATUS.Untrusted,
    });
    hookTrustOverride = createHookTrustOverride(untrustedHooks);
    await assertHostTargetSnapshotStable(artifacts);
    const trustedProbe = await dependencies.inspectCodexHooks({
      executable: current.codex.executable,
      arguments: createCodexAppServerArguments([...hookDeclarationOverrides, hookTrustOverride]),
      cwd: artifacts.worktreeRoot,
      codexHome: temporaryCodexHome,
    });
    trustedHooks = validateCodexHookProbe({
      probe: trustedProbe,
      candidateConfig: artifacts.candidateConfig,
      cwd: artifacts.worktreeRoot,
      codexHome: temporaryCodexHome,
      expectedTrustStatus: CODEX_HOOK_TRUST_STATUS.Trusted,
    });
    validateStableHookIdentity(untrustedHooks, trustedHooks);
  } catch (error) {
    preserveTemporaryHome = error?.processMayBeRunning === true;
    if (preserveTemporaryHome) {
      throw new Error(`无法确认 app-server 已退出，临时 Codex Home 已保留：${temporaryRoot}`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    if (!preserveTemporaryHome) await removeTemporaryCodexHome(temporaryRoot);
  }

  await validateStablePilotIdentities(current, dependencies);
  const finalArtifacts = await readValidatedHostActivation(current, paths);
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
    hookDeclarationOverrides,
    hookTrustOverride,
    trustedHooks,
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

async function removeTemporaryCodexHome(root) {
  const actual = resolve(root);
  const temporaryBase = resolve(tmpdir());
  const relation = relative(temporaryBase, actual);
  if (
    relation.startsWith("..") ||
    relation === "" ||
    basename(actual).startsWith(TEMPORARY_HOME_PREFIX) === false
  ) {
    throw new Error("拒绝清理无法证明归属的临时 Codex Home。");
  }
  const canonical = await realpath(actual);
  if (!pathsEqual(actual, canonical)) {
    throw new Error("临时 Codex Home 不得是符号链接或 junction。");
  }
  await assertOrdinaryTree(actual);
  await rm(actual, { recursive: true, force: true });
  try {
    await lstat(actual);
    throw new Error("临时 Codex Home 清理后仍然存在。");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function assertOrdinaryTree(root) {
  const metadata = await lstat(root);
  if (metadata.isSymbolicLink()) {
    throw new Error("临时 Codex Home 内不得出现符号链接或 junction。");
  }
  if (!metadata.isDirectory()) return;
  const entries = await readdir(root);
  for (const entry of entries) {
    await assertOrdinaryTree(join(root, entry));
  }
}

function pathsEqual(left, right) {
  return relative(resolve(left), resolve(right)) === "";
}
