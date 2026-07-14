import { lstatSync } from "node:fs";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { runProcess } from "../../common/process/index.mjs";
import { calculateDigest } from "../../publicProjectSmoke/digest/index.mjs";

const PREPARE_SCHEMA_VERSION = "liushi.codex-host-smoke.prepare.v3";
const ACTIVATION_PLAN_SCHEMA_VERSION = "liushi.codex-host-smoke.activation-plan.v1";
const VERIFICATION_SCHEMA_VERSION = "liushi.codex-host-smoke.verification.v1";
const MAX_JSON_BYTES = 1024 * 1024;

const defaultDependencies = {
  inspectWorktree,
  inspectCodexVersion,
};

export async function verifyCodexHostSmoke(input, overrides = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  const manifestPath = await validateJsonFile(input.manifestPath, "Manifest");
  const manifest = await readJson(manifestPath, "Manifest");
  assertManifest(manifest, input.activationDigest, manifestPath);

  const activationPlanPath = await validateJsonFile(
    manifest.activationPlan.path,
    "Activation Plan",
  );
  const activationPlan = await readJson(activationPlanPath, "Activation Plan");
  assertActivationPlan(manifest, activationPlan);

  const candidateConfigPath = await validateJsonFile(
    manifest.candidateHookConfig.path,
    "Candidate Hook Config",
  );
  const candidateConfig = await readJson(candidateConfigPath, "Candidate Hook Config");
  assertCandidateConfig(manifest, activationPlan, candidateConfig);

  const worktree = dependencies.inspectWorktree(manifest.paths.worktreeRoot);
  assertWorktree(manifest, worktree);
  await assertNotActivated(manifest, activationPlan);

  const codexVersion = dependencies.inspectCodexVersion(manifest.codexProbe.executable);
  if (!codexVersion.includes(manifest.codexProbe.version)) {
    throw new Error("Codex executable 版本已偏离 Prepare Manifest。");
  }

  return {
    schemaVersion: VERIFICATION_SCHEMA_VERSION,
    status: "verified",
    manifestPath,
    activationPlanPath,
    activationDigest: input.activationDigest,
    checks: [
      "manifest_digest",
      "activation_plan_digest",
      "candidate_hook_config_digest",
      "standard_clone_head_clean_detached",
      "host_not_activated",
      "codex_version",
    ],
  };
}

function assertManifest(manifest, activationDigest, manifestPath) {
  if (
    manifest?.schemaVersion !== PREPARE_SCHEMA_VERSION ||
    manifest.status !== "human_activation_required" ||
    manifest.activation?.digest !== activationDigest ||
    calculateDigest(manifest.activation.binding) !== activationDigest ||
    resolve(manifest.paths?.root ?? "") !== dirname(dirname(manifestPath))
  ) {
    throw new Error("Prepare Manifest 身份、状态或 Activation Digest 校验失败。");
  }
}

function assertActivationPlan(manifest, plan) {
  const digest = calculateDigest(plan);
  const allArgs = [
    ...(plan.hookBinding?.args ?? []),
    ...(plan.hostRuns ?? []).flatMap((run) => run.args ?? []),
  ];
  if (
    plan?.schemaVersion !== ACTIVATION_PLAN_SCHEMA_VERSION ||
    plan.status !== "human_approval_required" ||
    manifest.activationPlan.digest !== digest ||
    manifest.activation.binding.activationPlanDigest !== digest ||
    plan.projectTrust?.writeExecuted !== false ||
    plan.hookConfigWrite?.writeExecuted !== false ||
    plan.hookBinding?.executed !== false ||
    plan.hookDefinitionTrust?.completed !== false ||
    plan.hookDefinitionTrust?.bypassAllowed !== false ||
    !Array.isArray(plan.hostRuns) ||
    plan.hostRuns.length !== 2 ||
    plan.hostRuns.some((run) => run.executed !== false) ||
    allArgs.some((arg) => typeof arg !== "string" || arg.startsWith("--dangerously-"))
  ) {
    throw new Error("Activation Plan Digest、安全边界或未执行状态校验失败。");
  }
}

function assertCandidateConfig(manifest, plan, candidateConfig) {
  const digest = calculateDigest(candidateConfig);
  if (
    digest !== manifest.candidateHookConfig.digest ||
    digest !== plan.hookConfigWrite.sourceDigest ||
    resolve(plan.hookConfigWrite.source) !== resolve(manifest.candidateHookConfig.path) ||
    resolve(plan.hookConfigWrite.target) !== resolve(manifest.paths.intendedHookConfigFile)
  ) {
    throw new Error("Candidate Hook Config 路径或 Digest 已漂移。");
  }
}

function assertWorktree(manifest, actual) {
  if (
    resolve(actual.root) !== resolve(manifest.paths.worktreeRoot) ||
    actual.headRevision !== manifest.worktree.headRevision ||
    actual.clean !== true ||
    actual.detached !== true ||
    actual.gitEntryKind !== "directory" ||
    manifest.worktree.gitEntryKind !== "directory" ||
    manifest.activation.binding.worktreeGitEntryKind !== "directory"
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
    ...plan.hostRuns.flatMap((run) => [
      run.stdoutEvidence,
      run.stderrEvidence,
      findOutputLastMessage(run.args),
    ]),
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

function inspectCodexVersion(executable) {
  return runProcess(executable, ["--version"], {
    timeout: 30_000,
    maxBuffer: 64 * 1024,
  }).stdout.trim();
}

function runGit(cwd, args) {
  return runProcess("git", args, { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 }).stdout.trim();
}

function findOutputLastMessage(args) {
  const index = args.indexOf("--output-last-message");
  if (index < 0 || typeof args[index + 1] !== "string") {
    throw new Error("Host Run 缺少 --output-last-message 证据路径。");
  }
  return args[index + 1];
}

async function validateJsonFile(value, label) {
  if (typeof value !== "string" || value.includes("\0") || !isAbsolute(value)) {
    throw new Error(`${label} 必须是无 NUL 的绝对路径。`);
  }
  const path = resolve(value);
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_JSON_BYTES) {
    throw new Error(`${label} 必须是大小受限的普通 JSON 文件。`);
  }
  return realpath(path);
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} 不是有效 JSON。`, { cause: error });
  }
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
