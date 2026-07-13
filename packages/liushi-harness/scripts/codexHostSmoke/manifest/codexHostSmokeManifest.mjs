import { calculateDigest } from "../../publicProjectSmoke/digest/index.mjs";
import {
  CODEX_HOST_SMOKE_NOT_EXECUTED,
  CODEX_HOST_SMOKE_PREPARE_SCHEMA_VERSION,
  CODEX_HOST_SMOKE_REQUIRED_HUMAN_ACTIONS,
  CODEX_HOST_SMOKE_STATUS,
} from "../constants/index.mjs";

export function createCodexHostSmokeManifest(input) {
  const activationBinding = createActivationBinding(input);
  return {
    schemaVersion: CODEX_HOST_SMOKE_PREPARE_SCHEMA_VERSION,
    status: CODEX_HOST_SMOKE_STATUS,
    generatedAt: input.generatedAt,
    project: input.project,
    package: input.package,
    executionEnvironment: input.executionEnvironment,
    paths: input.paths,
    worktree: input.worktree,
    codexProbe: input.codexProbe,
    candidateHookConfig: input.candidateHookConfig,
    bindingCandidate: input.bindingCandidate,
    activation: {
      digest: calculateDigest(activationBinding),
      binding: activationBinding,
      requiredHumanActions: CODEX_HOST_SMOKE_REQUIRED_HUMAN_ACTIONS,
    },
    notExecuted: CODEX_HOST_SMOKE_NOT_EXECUTED,
  };
}

export function calculateActivationDigest(input) {
  return calculateDigest(createActivationBinding(input));
}

function createActivationBinding(input) {
  return {
    schemaVersion: CODEX_HOST_SMOKE_PREPARE_SCHEMA_VERSION,
    repositoryId: input.project.repositoryId,
    repositoryRevision: input.project.revision,
    worktreeRoot: input.paths.worktreeRoot,
    worktreeHeadRevision: input.worktree.headRevision,
    worktreeClean: input.worktree.clean,
    worktreeDetached: input.worktree.detached,
    codexExecutable: input.codexProbe.executable,
    codexVersion: input.codexProbe.version,
    codexProbeDigest: calculateDigest(input.codexProbe),
    packageArtifactSha256: input.package.artifact.sha256,
    candidateHookConfigDigest: input.candidateHookConfig.digest,
    workspaceId: input.bindingCandidate.workspaceId,
    taskId: input.bindingCandidate.taskId,
    planRiskArtifactId: input.bindingCandidate.planRiskArtifactId,
    planRiskArtifactDigest: input.bindingCandidate.planRiskArtifactDigest,
    requiredHumanActions: CODEX_HOST_SMOKE_REQUIRED_HUMAN_ACTIONS,
  };
}
