import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { runProcess } from "../../common/process/index.mjs";
import { calculateDigest } from "../../publicProjectSmoke/digest/index.mjs";
import { CODEX_HOST_SMOKE_RUNTIME_DIRECTORY } from "../constants/index.mjs";

const PREPARE_SCHEMA_VERSION = "liushi.codex-host-smoke.prepare.v5";
const ACTIVATION_PLAN_SCHEMA_VERSION = "liushi.codex-host-smoke.activation-plan.v2";
const CODEX_EXEC_ISSUE_URL = "https://github.com/openai/codex/issues/18607";
const MAX_JSON_BYTES = 1024 * 1024;
const POSITIVE_SCENARIO = {
  id: "positive_write_set",
  target: "test/utils.test.ts",
  marker: "// liushi-host-smoke-positive",
  expectedDecision: "allow_without_stdout",
};

export async function loadAndVerifyCodexHostSmokePacket(input) {
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

  return {
    manifestPath,
    activationPlanPath,
    candidateConfigPath,
    manifest,
    activationPlan,
    candidateConfig,
  };
}

export function inspectCodexHostSmokeVersion(executable) {
  return runProcess(executable, ["--version"], {
    timeout: 30_000,
    maxBuffer: 64 * 1024,
  }).stdout.trim();
}

export function assertCodexHostSmokeVersion(manifest, actualVersion) {
  if (typeof actualVersion !== "string" || !actualVersion.includes(manifest.codexProbe.version)) {
    throw new Error("Codex executable 版本已偏离 Prepare Manifest。");
  }
}

export function getCodexHostSmokeScenarios(activationPlan) {
  return {
    positive: activationPlan.hostScenarios[0],
    negative: activationPlan.hostScenarios[1],
  };
}

export async function readCodexHostSmokeJsonFile(path, label) {
  const validated = await validateJsonFile(path, label);
  return readJson(validated, label);
}

function assertManifest(manifest, activationDigest, manifestPath) {
  const paths = manifest?.paths;
  const binding = manifest?.activation?.binding;
  if (
    manifest?.schemaVersion !== PREPARE_SCHEMA_VERSION ||
    manifest.status !== "human_activation_required" ||
    !isIsoDate(manifest.generatedAt) ||
    manifest.activation?.digest !== activationDigest ||
    calculateDigest(binding) !== activationDigest ||
    resolve(paths?.root ?? "") !== dirname(dirname(manifestPath)) ||
    !allAbsolutePaths(paths) ||
    resolve(paths.storeRoot) !==
      resolve(join(paths.worktreeRoot, CODEX_HOST_SMOKE_RUNTIME_DIRECTORY)) ||
    manifest.worktree?.headRevision !== manifest.project?.revision ||
    manifest.worktree?.gitEntryKind !== "directory" ||
    binding?.schemaVersion !== PREPARE_SCHEMA_VERSION ||
    binding.repositoryRevision !== manifest.project.revision ||
    binding.worktreeRoot !== paths.worktreeRoot ||
    binding.worktreeHeadRevision !== manifest.worktree.headRevision ||
    binding.worktreeGitEntryKind !== "directory" ||
    binding.codexExecutable !== manifest.codexProbe?.executable ||
    binding.codexVersion !== manifest.codexProbe.version ||
    binding.candidateHookConfigDigest !== manifest.candidateHookConfig?.digest ||
    binding.workspaceId !== manifest.bindingCandidate?.workspaceId ||
    binding.taskId !== manifest.bindingCandidate?.taskId ||
    binding.planRiskArtifactId !== manifest.bindingCandidate?.planRiskArtifactId ||
    binding.planRiskArtifactDigest !== manifest.bindingCandidate?.planRiskArtifactDigest
  ) {
    throw new Error("Prepare Manifest 身份、状态或 Activation Digest 校验失败。");
  }
}

function assertActivationPlan(manifest, plan) {
  const digest = calculateDigest(plan);
  const expectedSessionArgs = [
    "--model",
    plan.model?.id,
    "--config",
    'model_reasoning_effort="low"',
    "--sandbox",
    "workspace-write",
    "--cd",
    manifest.paths.worktreeRoot,
  ];
  const allArgs = [...(plan.hookBinding?.args ?? []), ...(plan.hostSession?.args ?? [])];
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
    plan.hostSession?.mode !== "interactive_tui" ||
    plan.hostSession.executable !== manifest.codexProbe.executable ||
    plan.hostSession.launchExecuted !== false ||
    Object.hasOwn(plan.hostSession, "prompt") ||
    !isDeepStrictEqual(plan.hostSession.args, expectedSessionArgs) ||
    !isDeepStrictEqual(plan.unsupportedHostModes, [
      {
        mode: "codex_exec",
        supported: false,
        reason:
          "codex exec 在当前验收路径中未可靠触发 PreToolUse/PostToolUse，不能承载本次 Host Hook 验收。",
        issueUrl: CODEX_EXEC_ISSUE_URL,
      },
    ]) ||
    Object.hasOwn(plan, "hostRuns") ||
    !Array.isArray(plan.hostScenarios) ||
    plan.hostScenarios.length !== 2 ||
    !isExpectedScenario(plan.hostScenarios[0], POSITIVE_SCENARIO) ||
    !isExpectedScenario(
      plan.hostScenarios[1],
      createExpectedNegativeScenario(manifest.bindingCandidate.taskId),
    ) ||
    allArgs.some(
      (arg) =>
        typeof arg !== "string" ||
        arg === "exec" ||
        arg === "--ephemeral" ||
        arg.startsWith("--dangerously-"),
    )
  ) {
    throw new Error("Activation Plan Digest、安全边界或未执行状态校验失败。");
  }
}

function createExpectedNegativeScenario(taskId) {
  return {
    id: "negative_outside_write_set",
    target: `liushiHostSmokeNegative${taskId}.md`,
    marker: `<!-- liushi-host-smoke-negative:${taskId} -->`,
    expectedDecision: "deny_without_file_mutation",
  };
}

function isExpectedScenario(actual, expected) {
  return (
    actual?.id === expected.id &&
    actual.target === expected.target &&
    actual.marker === expected.marker &&
    actual.expectedDecision === expected.expectedDecision &&
    typeof actual.prompt === "string" &&
    actual.prompt.length > 0 &&
    actual.executed === false &&
    !Object.hasOwn(actual, "args") &&
    !Object.hasOwn(actual, "executable")
  );
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

function allAbsolutePaths(paths) {
  return (
    paths !== null &&
    typeof paths === "object" &&
    [
      paths.root,
      paths.repositoryRoot,
      paths.worktreeRoot,
      paths.storeRoot,
      paths.consumerRoot,
      paths.candidateConfigFile,
      paths.activationPlanFile,
      paths.intendedHookConfigFile,
    ].every((path) => typeof path === "string" && !path.includes("\0") && isAbsolute(path))
  );
}

function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
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
