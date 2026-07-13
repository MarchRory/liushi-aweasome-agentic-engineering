import { access, lstat, mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";

import {
  PUBLIC_PACKAGE_MANAGER,
  PUBLIC_REPOSITORY_ID,
  PUBLIC_REPOSITORY_REVISION,
  PUBLIC_REPOSITORY_URL,
  WORKSPACE_ID,
} from "../../publicProjectSmoke/constants/index.mjs";
import { calculateDigest } from "../../publicProjectSmoke/digest/index.mjs";
import {
  createHarnessConsumer,
  establishGateProtocol,
  runHarnessEnvelope,
  runHarnessNativeJson,
} from "../../publicProjectSmoke/harnessClient/index.mjs";
import { clonePublicProject, runBaseline } from "../../publicProjectSmoke/project/index.mjs";
import { createCodexHostSmokeActivationPlan } from "../activation/index.mjs";
import { createCandidateHookConfig } from "../config/index.mjs";
import {
  CODEX_HOST_SMOKE_ACTIVATION_PLAN_FILE,
  CODEX_HOST_SMOKE_CANDIDATE_CONFIG_FILE,
  CODEX_HOST_SMOKE_CONTROL_DIRECTORY,
  CODEX_HOST_SMOKE_MANIFEST_FILE,
  CODEX_HOST_SMOKE_RUNTIME_DIRECTORY,
  CODEX_HOST_SMOKE_STATUS,
  CODEX_HOST_SMOKE_WORKTREE_DIRECTORY,
} from "../constants/index.mjs";
import { createCodexHostSmokeManifest } from "../manifest/index.mjs";
import { runCodexHostSmokeCommand } from "../policy/index.mjs";
import { createCodexHostSmokeWorktree } from "../project/index.mjs";

const defaultDependencies = {
  clonePublicProject,
  runBaseline,
  createHarnessConsumer,
  establishGateProtocol,
  createWorktree: createCodexHostSmokeWorktree,
  runHarnessEnvelope,
  runHarnessNativeJson,
  now: () => new Date().toISOString(),
};

export async function prepareCodexHostSmoke(input, overrides = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  const codexExecutable = await validateCodexExecutable(input.codexExecutable);
  const codexHome = await validateCodexHome(input.codexHome);
  const root = validateAbsolutePath(input.root, "--root");
  let rootCreated = false;
  try {
    await mkdir(root);
    rootCreated = true;
    const paths = createPaths(root);
    await Promise.all([mkdir(paths.controlRoot), mkdir(paths.storeRoot)]);

    const repositoryRoot = await dependencies.clonePublicProject(root);
    const baselineChecks = await dependencies.runBaseline(repositoryRoot);
    const worktree = validateWorktree(
      await dependencies.createWorktree(repositoryRoot, paths.worktreeRoot),
    );
    const consumer = await dependencies.createHarnessConsumer(input.packageRoot, root);
    const runEnvelope = (consumerRoot, args) =>
      runCodexHostSmokeCommand(dependencies.runHarnessEnvelope, consumerRoot, args);
    const gate = await dependencies.establishGateProtocol({
      consumerRoot: consumer.consumerRoot,
      storeRoot: paths.storeRoot,
      runEnvelope,
    });
    const probe = validateProbe(
      runEnvelope(consumer.consumerRoot, [
        "hook",
        "probe",
        "--executor",
        "codex",
        "--executable",
        codexExecutable,
        "--json",
      ]),
      codexExecutable,
    );
    const projection = runCodexHostSmokeCommand(
      dependencies.runHarnessNativeJson,
      consumer.consumerRoot,
      ["hook", "config", "--executor", "codex"],
    );
    const cliEntrypoint = join(
      consumer.consumerRoot,
      "node_modules",
      "liushi-harness",
      "dist",
      "bootstrap",
      "cli",
      "cliEntrypoint.js",
    );
    await access(cliEntrypoint);
    const candidateConfig = createCandidateHookConfig({
      projection,
      nodeExecutable: process.execPath,
      cliEntrypoint,
      storeRoot: paths.storeRoot,
    });
    await writeFile(
      paths.candidateConfigFile,
      `${JSON.stringify(candidateConfig, null, 2)}\n`,
      "utf8",
    );
    const bindingCandidate = createBindingCandidate(gate, paths.worktreeRoot);
    const candidateConfigDigest = calculateDigest(candidateConfig);
    const intendedHookConfigFile = join(paths.worktreeRoot, ".codex", "hooks.json");
    const activationPlan = createCodexHostSmokeActivationPlan({
      actorId: input.actorId,
      model: input.model,
      codexExecutable,
      codexHome,
      nodeExecutable: process.execPath,
      cliEntrypoint,
      controlRoot: paths.controlRoot,
      storeRoot: paths.storeRoot,
      worktreeRoot: paths.worktreeRoot,
      candidateConfigFile: paths.candidateConfigFile,
      candidateConfigDigest,
      intendedHookConfigFile,
      bindingCandidate,
    });
    await writeFile(
      paths.activationPlanFile,
      `${JSON.stringify(activationPlan, null, 2)}\n`,
      "utf8",
    );

    const manifest = createCodexHostSmokeManifest({
      generatedAt: dependencies.now(),
      project: {
        repositoryId: PUBLIC_REPOSITORY_ID,
        url: PUBLIC_REPOSITORY_URL,
        revision: PUBLIC_REPOSITORY_REVISION,
        packageManager: PUBLIC_PACKAGE_MANAGER,
      },
      package: {
        name: "liushi-harness",
        version: consumer.packageVersion,
        artifact: consumer.packageArtifact,
      },
      executionEnvironment: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
      paths: {
        root,
        repositoryRoot,
        worktreeRoot: paths.worktreeRoot,
        storeRoot: paths.storeRoot,
        consumerRoot: consumer.consumerRoot,
        candidateConfigFile: paths.candidateConfigFile,
        activationPlanFile: paths.activationPlanFile,
        intendedHookConfigFile,
      },
      worktree: {
        ...worktree,
        baselineChecks,
      },
      codexProbe: probe,
      candidateHookConfig: {
        path: paths.candidateConfigFile,
        digest: candidateConfigDigest,
      },
      activationPlan,
      bindingCandidate,
    });
    await writeFile(paths.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return {
      status: CODEX_HOST_SMOKE_STATUS,
      manifestPath: paths.manifestFile,
      activationPlanPath: paths.activationPlanFile,
      worktreeRoot: paths.worktreeRoot,
      activationDigest: manifest.activation.digest,
      requiredHumanActions: manifest.activation.requiredHumanActions,
    };
  } catch (error) {
    if (rootCreated) await removeOwnedRoot(root);
    throw error;
  }
}

function createPaths(root) {
  const controlRoot = join(root, CODEX_HOST_SMOKE_CONTROL_DIRECTORY);
  return {
    controlRoot,
    storeRoot: join(root, CODEX_HOST_SMOKE_RUNTIME_DIRECTORY),
    worktreeRoot: join(root, CODEX_HOST_SMOKE_WORKTREE_DIRECTORY),
    candidateConfigFile: join(controlRoot, CODEX_HOST_SMOKE_CANDIDATE_CONFIG_FILE),
    activationPlanFile: join(controlRoot, CODEX_HOST_SMOKE_ACTIVATION_PLAN_FILE),
    manifestFile: join(controlRoot, CODEX_HOST_SMOKE_MANIFEST_FILE),
  };
}

function createBindingCandidate(gate, worktreeRoot) {
  const planRisk = gate.executionAuthorization?.planRisk;
  if (
    typeof gate.sourceTaskId !== "string" ||
    typeof planRisk?.artifactId !== "string" ||
    typeof planRisk.artifactDigest !== "string" ||
    planRisk.result !== "allow"
  ) {
    throw new Error("Gate Protocol 未返回可供 Human 审阅的 PlanRisk Binding。");
  }
  return {
    workspaceRoot: worktreeRoot,
    workspaceId: WORKSPACE_ID,
    taskId: gate.sourceTaskId,
    planRiskArtifactId: planRisk.artifactId,
    planRiskArtifactDigest: planRisk.artifactDigest,
    gateResult: planRisk.result,
    hookBindExecuted: false,
  };
}

function validateWorktree(worktree) {
  if (
    worktree?.headRevision !== PUBLIC_REPOSITORY_REVISION ||
    worktree.clean !== true ||
    worktree.detached !== true
  ) {
    throw new Error("Codex Host Smoke Worktree 未满足固定 Revision、Detached 和 Clean 约束。");
  }
  return worktree;
}

function validateProbe(envelope, executable) {
  const report = envelope?.data;
  const expectedCommands = [
    { kind: "version", executable, args: ["--version"] },
    { kind: "help", executable, args: ["--help"] },
    { kind: "features_list", executable, args: ["features", "list"] },
  ];
  if (
    envelope?.status !== "success" ||
    report?.schemaVersion !== "2.0.0" ||
    report.executable !== executable ||
    typeof report.version !== "string" ||
    report.version.length === 0 ||
    report.overallStatus !== "verified" ||
    report.hookFramework?.status !== "verified" ||
    report.productionVerified !== false ||
    !isDeepStrictEqual(report.commands, expectedCommands)
  ) {
    throw new Error("Codex 静态 Probe 未满足 Host Smoke Prepare 前置条件。");
  }
  return {
    schemaVersion: report.schemaVersion,
    executable: report.executable,
    version: report.version,
    overallStatus: report.overallStatus,
    hookFrameworkStatus: report.hookFramework.status,
    productionVerified: report.productionVerified,
    commands: report.commands,
  };
}

async function validateCodexExecutable(value) {
  const executable = validateAbsolutePath(value, "--codex");
  const metadata = await stat(executable);
  if (!metadata.isFile()) throw new Error("--codex 必须指向已存在的文件。");
  return realpath(executable);
}

async function validateCodexHome(value) {
  const codexHome = validateAbsolutePath(value, "--codex-home");
  const metadata = await stat(codexHome);
  if (!metadata.isDirectory()) throw new Error("--codex-home 必须指向已存在的目录。");
  const config = await stat(join(codexHome, "config.toml"));
  if (!config.isFile()) throw new Error("--codex-home 必须包含 config.toml。");
  return realpath(codexHome);
}

function validateAbsolutePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !isAbsolute(value)
  ) {
    throw new Error(`${label} 必须是无 NUL 的非空绝对路径。`);
  }
  return resolve(value);
}

async function removeOwnedRoot(root) {
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || dirname(root) === root) {
    throw new Error("拒绝清理无法证明由 Prepare 创建的根目录。");
  }
  await rm(root, { recursive: true, force: true });
}
