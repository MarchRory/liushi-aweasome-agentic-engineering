import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";

import {
  CODEX_HOST_SMOKE_ACTIVATION_PLAN_FILE,
  CODEX_HOST_SMOKE_CANDIDATE_CONFIG_FILE,
  CODEX_HOST_SMOKE_CONSUMER_DIRECTORY,
  CODEX_HOST_SMOKE_CONTROL_DIRECTORY,
  CODEX_HOST_SMOKE_EXEC_ISSUE_URL,
  CODEX_HOST_SMOKE_EXEC_UNSUPPORTED_REASON,
  CODEX_HOST_SMOKE_MANIFEST_FILE,
  CODEX_HOST_SMOKE_NOT_EXECUTED,
  CODEX_HOST_SMOKE_PACKAGE_MANAGER,
  CODEX_HOST_SMOKE_REPOSITORY_DIRECTORY,
  CODEX_HOST_SMOKE_REPOSITORY_ID,
  CODEX_HOST_SMOKE_REPOSITORY_REVISION,
  CODEX_HOST_SMOKE_REPOSITORY_URL,
  CODEX_HOST_SMOKE_REASONING_EFFORT,
  CODEX_HOST_SMOKE_REQUIRED_HUMAN_ACTIONS,
  CODEX_HOST_SMOKE_ROLLBACK_INSTRUCTION,
  CODEX_HOST_SMOKE_RUNTIME_DIRECTORY,
  CODEX_HOST_SMOKE_SANDBOX,
  CODEX_HOST_SMOKE_UNSUPPORTED_MODE,
  CODEX_HOST_SMOKE_WORKSPACE_ID,
  CODEX_HOST_SMOKE_WORKTREE_DIRECTORY,
} from "../constants/index.js";
import { createCodexHostPathSemantics, type CodexHostPathSemantics } from "../platform/index.js";
import { matchesCodexHostSmokeScenarioProtocol } from "../protocol/index.js";
import type {
  CodexHostSmokeActivationPlanSource,
  CodexHostSmokePrepareManifestSource,
  CodexHostSmokeResultSource,
} from "../schemas/index.js";

/** 校验完整 Host Packet 的身份、路径、场景和未执行状态语义。 */
export function validateCodexHostSmokeSourceSemantics(
  manifest: CodexHostSmokePrepareManifestSource,
  plan: CodexHostSmokeActivationPlanSource,
  result: CodexHostSmokeResultSource,
): Result<void, HarnessError> {
  const hostPaths = createCodexHostPathSemantics(manifest.executionEnvironment.platform);
  if (hostPaths.status === ResultStatus.Failure) return hostPaths;
  const paths = hostPaths.value;
  const allPaths = [
    ...Object.values(manifest.paths),
    manifest.candidateHookConfig.path,
    manifest.activationPlan.path,
    result.manifestPath,
    result.activationPlanPath,
    plan.projectTrust.configFile,
    plan.projectTrust.projectRoot,
    plan.hookConfigWrite.source,
    plan.hookConfigWrite.target,
    plan.hookBinding.executable,
    plan.hostSession.executable,
    plan.hookDefinitionTrust.expectedSource,
    plan.rollback.exactHookConfigFile,
    plan.rollback.exactRuntimeRoot,
  ];
  if (!allPaths.every((path) => paths.isAbsolute(path))) {
    return invalid("Codex host packet path is invalid.");
  }

  const binding = manifest.activation.binding;
  const candidate = manifest.bindingCandidate;
  if (
    !paths.equals(
      result.manifestPath,
      paths.join(
        manifest.paths.root,
        CODEX_HOST_SMOKE_CONTROL_DIRECTORY,
        CODEX_HOST_SMOKE_MANIFEST_FILE,
      ),
    ) ||
    !paths.equals(
      manifest.paths.repositoryRoot,
      paths.join(manifest.paths.root, CODEX_HOST_SMOKE_REPOSITORY_DIRECTORY),
    ) ||
    !paths.equals(
      manifest.paths.worktreeRoot,
      paths.join(manifest.paths.root, CODEX_HOST_SMOKE_WORKTREE_DIRECTORY),
    ) ||
    !paths.equals(
      manifest.paths.consumerRoot,
      paths.join(manifest.paths.root, CODEX_HOST_SMOKE_CONSUMER_DIRECTORY),
    ) ||
    !paths.equals(
      manifest.paths.candidateConfigFile,
      paths.join(
        manifest.paths.root,
        CODEX_HOST_SMOKE_CONTROL_DIRECTORY,
        CODEX_HOST_SMOKE_CANDIDATE_CONFIG_FILE,
      ),
    ) ||
    !paths.equals(
      manifest.paths.activationPlanFile,
      paths.join(
        manifest.paths.root,
        CODEX_HOST_SMOKE_CONTROL_DIRECTORY,
        CODEX_HOST_SMOKE_ACTIVATION_PLAN_FILE,
      ),
    ) ||
    !paths.equals(
      manifest.paths.intendedHookConfigFile,
      paths.join(manifest.paths.worktreeRoot, ".codex", "hooks.json"),
    ) ||
    !paths.equals(result.activationPlanPath, manifest.activationPlan.path) ||
    !paths.equals(manifest.activationPlan.path, manifest.paths.activationPlanFile) ||
    !paths.equals(manifest.candidateHookConfig.path, manifest.paths.candidateConfigFile) ||
    !paths.equals(
      manifest.paths.storeRoot,
      paths.join(manifest.paths.worktreeRoot, CODEX_HOST_SMOKE_RUNTIME_DIRECTORY),
    ) ||
    manifest.project.repositoryId !== CODEX_HOST_SMOKE_REPOSITORY_ID ||
    manifest.project.url !== CODEX_HOST_SMOKE_REPOSITORY_URL ||
    manifest.project.revision !== CODEX_HOST_SMOKE_REPOSITORY_REVISION ||
    manifest.project.packageManager !== CODEX_HOST_SMOKE_PACKAGE_MANAGER ||
    manifest.project.revision !== manifest.worktree.headRevision ||
    !sameStringsInOrder(
      manifest.worktree.baselineChecks.map((item) => `${item.checkId}:${item.status}`),
      ["baseline-install:passed", "baseline-test:passed"],
    ) ||
    binding.repositoryId !== manifest.project.repositoryId ||
    binding.repositoryRevision !== manifest.project.revision ||
    !paths.equals(binding.worktreeRoot, manifest.paths.worktreeRoot) ||
    binding.worktreeHeadRevision !== manifest.worktree.headRevision ||
    binding.worktreeClean !== manifest.worktree.clean ||
    binding.worktreeDetached !== manifest.worktree.detached ||
    binding.worktreeGitEntryKind !== manifest.worktree.gitEntryKind ||
    binding.codexExecutable !== manifest.codexProbe.executable ||
    binding.codexVersion !== manifest.codexProbe.version ||
    binding.packageArtifactSha256 !== manifest.package.artifact.sha256 ||
    binding.candidateHookConfigDigest !== manifest.candidateHookConfig.digest ||
    binding.workspaceId !== candidate.workspaceId ||
    binding.taskId !== candidate.taskId ||
    binding.planRiskArtifactId !== candidate.planRiskArtifactId ||
    binding.planRiskArtifactDigest !== candidate.planRiskArtifactDigest ||
    candidate.workspaceId !== CODEX_HOST_SMOKE_WORKSPACE_ID ||
    !paths.equals(candidate.workspaceRoot, manifest.paths.worktreeRoot) ||
    !sameStringsInOrder(binding.requiredHumanActions, CODEX_HOST_SMOKE_REQUIRED_HUMAN_ACTIONS) ||
    !sameStringsInOrder(
      manifest.activation.requiredHumanActions,
      CODEX_HOST_SMOKE_REQUIRED_HUMAN_ACTIONS,
    ) ||
    !sameStringsInOrder(manifest.notExecuted, CODEX_HOST_SMOKE_NOT_EXECUTED)
  ) {
    return invalid("Codex host packet manifest semantic binding drifted.");
  }

  return validateActivationPlan(manifest, plan, paths);
}

function validateActivationPlan(
  manifest: CodexHostSmokePrepareManifestSource,
  plan: CodexHostSmokeActivationPlanSource,
  paths: CodexHostPathSemantics,
): Result<void, HarnessError> {
  const binding = manifest.bindingCandidate;
  const cliEntrypoint = plan.hookBinding.args[0];
  const expectedCliEntrypoint = paths.join(
    manifest.paths.consumerRoot,
    "node_modules",
    "liushi-harness",
    "dist",
    "bootstrap",
    "cli",
    "cliEntrypoint.js",
  );
  if (
    cliEntrypoint === undefined ||
    !paths.isAbsolute(cliEntrypoint) ||
    !paths.equals(cliEntrypoint, expectedCliEntrypoint)
  ) {
    return invalid("Codex host packet hook binding executable is invalid.");
  }
  const expectedHookBindingArgs = [
    cliEntrypoint,
    "hook",
    "bind",
    "--root",
    manifest.paths.worktreeRoot,
    "--workspace",
    binding.workspaceId,
    "--task",
    binding.taskId,
    "--artifact",
    binding.planRiskArtifactId,
    "--artifact-digest",
    binding.planRiskArtifactDigest,
    "--actor-id",
    plan.actorId,
    "--store",
    manifest.paths.storeRoot,
    "--json",
  ];
  const expectedSessionArgs = [
    "--model",
    plan.model.id,
    "--config",
    `model_reasoning_effort=${JSON.stringify(CODEX_HOST_SMOKE_REASONING_EFFORT)}`,
    "--sandbox",
    CODEX_HOST_SMOKE_SANDBOX,
    "--cd",
    manifest.paths.worktreeRoot,
  ];
  if (
    !paths.equals(plan.projectTrust.projectRoot, manifest.paths.worktreeRoot) ||
    plan.projectTrust.proposedToml !==
      `[projects.${JSON.stringify(manifest.paths.worktreeRoot)}]\ntrust_level = "trusted"\n` ||
    !paths.equals(plan.hookConfigWrite.source, manifest.candidateHookConfig.path) ||
    plan.hookConfigWrite.sourceDigest !== manifest.candidateHookConfig.digest ||
    !paths.equals(plan.hookConfigWrite.target, manifest.paths.intendedHookConfigFile) ||
    !sameStringsInOrder(plan.hookBinding.args, expectedHookBindingArgs) ||
    plan.hookDefinitionTrust.expectedConfigDigest !== manifest.candidateHookConfig.digest ||
    !paths.equals(plan.hookDefinitionTrust.expectedSource, manifest.paths.intendedHookConfigFile) ||
    plan.hostSession.executable !== manifest.codexProbe.executable ||
    !sameStringsInOrder(plan.hostSession.args, expectedSessionArgs) ||
    !isExpectedUnsupportedMode(plan) ||
    !matchesCodexHostSmokeScenarioProtocol(plan.hostScenarios, binding.taskId) ||
    !paths.equals(plan.rollback.exactHookConfigFile, manifest.paths.intendedHookConfigFile) ||
    !paths.equals(plan.rollback.exactRuntimeRoot, manifest.paths.storeRoot) ||
    plan.rollback.instruction !== CODEX_HOST_SMOKE_ROLLBACK_INSTRUCTION
  ) {
    return invalid("Codex host packet activation semantic binding drifted.");
  }
  return success(undefined);
}

function isExpectedUnsupportedMode(plan: CodexHostSmokeActivationPlanSource): boolean {
  const mode = plan.unsupportedHostModes[0];
  return (
    mode?.mode === CODEX_HOST_SMOKE_UNSUPPORTED_MODE &&
    mode.reason === CODEX_HOST_SMOKE_EXEC_UNSUPPORTED_REASON &&
    mode.issueUrl === CODEX_HOST_SMOKE_EXEC_ISSUE_URL
  );
}

function sameStringsInOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function invalid(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
