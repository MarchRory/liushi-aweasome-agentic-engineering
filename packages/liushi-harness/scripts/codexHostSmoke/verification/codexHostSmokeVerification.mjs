import { lstatSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { runProcess } from "../../common/process/index.mjs";
import {
  assertCodexHostSmokeVersion,
  inspectCodexHostSmokeVersion,
  loadAndVerifyCodexHostSmokePacket,
} from "./codexHostSmokePacketVerification.mjs";

const VERIFICATION_SCHEMA_VERSION = "liushi.codex-host-smoke.verification.v2";

const defaultDependencies = {
  inspectWorktree,
  inspectCodexVersion: inspectCodexHostSmokeVersion,
};

export async function verifyCodexHostSmoke(input, overrides = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  const packet = await loadAndVerifyCodexHostSmokePacket(input);
  const worktree = dependencies.inspectWorktree(packet.manifest.paths.worktreeRoot);
  assertWorktree(packet.manifest, worktree);
  await assertNotActivated(packet.manifest, packet.activationPlan);
  assertCodexHostSmokeVersion(
    packet.manifest,
    dependencies.inspectCodexVersion(packet.manifest.codexProbe.executable),
  );

  return {
    schemaVersion: VERIFICATION_SCHEMA_VERSION,
    status: "verified",
    manifestPath: packet.manifestPath,
    activationPlanPath: packet.activationPlanPath,
    activationDigest: input.activationDigest,
    checks: [
      "manifest_digest",
      "activation_plan_digest",
      "candidate_hook_config_digest",
      "interactive_tui_plan_safety",
      "standard_clone_head_clean_detached",
      "host_not_activated",
      "codex_version",
    ],
  };
}

function assertWorktree(manifest, actual) {
  if (
    resolve(actual.root) !== resolve(manifest.paths.worktreeRoot) ||
    actual.headRevision !== manifest.worktree.headRevision ||
    actual.clean !== true ||
    actual.detached !== true ||
    actual.gitEntryKind !== "directory"
  ) {
    throw new Error("Host Smoke 普通 Clone、HEAD、clean 或 detached 状态已漂移。");
  }
}

async function assertNotActivated(manifest, plan) {
  const trustConfig = await readFile(plan.projectTrust.configFile, "utf8");
  if (trustConfig.includes(plan.projectTrust.proposedToml.trim())) {
    throw new Error("Host Smoke 精确项目 trust 已在未获批准时出现。");
  }
  for (const path of [
    manifest.paths.intendedHookConfigFile,
    join(manifest.paths.storeRoot, "hookBindings", "bindings.json"),
  ]) {
    if (await pathExists(path)) throw new Error(`Host Smoke 已出现未获批准的激活产物：${path}。`);
  }
}

function inspectWorktree(root) {
  const headRevision = runGit(root, ["rev-parse", "HEAD"]);
  const status = runGit(root, ["status", "--porcelain=v1"]);
  const branch = runGit(root, ["branch", "--show-current"]);
  const gitEntry = lstatSync(join(root, ".git"));
  const gitEntryKind =
    gitEntry.isDirectory() && !gitEntry.isSymbolicLink() ? "directory" : "unsupported";
  return {
    root,
    headRevision,
    clean: status.length === 0,
    detached: branch.length === 0,
    gitEntryKind,
  };
}

function runGit(cwd, args) {
  return runProcess("git", args, { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 }).stdout.trim();
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
