import type { ExecutorCompatibilityEvidenceProjection } from "#application/ports/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import {
  ExecutorAdapterKind,
  ExecutorDistribution,
  ExecutorEvidenceLocatorKind,
  ExecutorEvidenceOutcome,
  ExecutorHostSurface,
  MANAGED_FILE_MUTATION_HOOK_PROFILE_ID,
  createManagedFileMutationHookPolicy,
  validateExecutorCompatibilityInput,
  type ExecutorCompatibilityDigestPort,
  type ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";

import { CODEX_HOST_SMOKE_REQUIRED_CHECKS, CODEX_STATIC_PROBE_CHECKS } from "../constants/index.js";
import type { CodexCompatibilityEvidenceArtifact } from "../contracts/index.js";
import { projectCodexCompatibilityEvidenceRecords } from "../evidenceRecords/index.js";
import { CodexCompatibilityObservationKind } from "../enums/index.js";
import { createCodexCompatibilityEvidenceLocator } from "../locators/index.js";
import { codexCompatibilityEvidenceArtifactSchema, codexVersionSchema } from "../schemas/index.js";

/** 从持久化 Artifact 重新生成 Evidence，并拒绝任何自报 Projection。 */
export function verifyPersistedCodexCompatibilityProjection(
  projection: ExecutorCompatibilityEvidenceProjection,
  digestPort: ExecutorCompatibilityDigestPort,
): Result<ExecutorCompatibilityEvidenceProjection, HarnessError> {
  const artifact = parseArtifact(projection.artifact);
  if (artifact.status === ResultStatus.Failure) return artifact;
  const artifactSemantics = validateArtifactSemantics(artifact.value);
  if (artifactSemantics.status === ResultStatus.Failure) return artifactSemantics;
  const artifactDigest = parseDigest(projection.artifactDigest);
  if (artifactDigest.status === ResultStatus.Failure) return artifactDigest;

  const calculatedArtifactDigest = digestPort.calculate(artifact.value);
  if (calculatedArtifactDigest.status === ResultStatus.Failure) {
    return corrupt("Codex Compatibility Artifact 摘要无法重算。", calculatedArtifactDigest.error);
  }
  if (calculatedArtifactDigest.value !== artifactDigest.value) {
    return corrupt("Codex Compatibility Artifact 摘要不匹配。");
  }

  const locator = createCodexCompatibilityEvidenceLocator(
    ExecutorEvidenceLocatorKind.RuntimeStore,
    artifactDigest.value,
  );
  if (locator.status === ResultStatus.Failure) {
    return corrupt("Codex Compatibility Artifact Locator 无法重建。", locator.error);
  }
  const expectedEvidence = projectCodexCompatibilityEvidenceRecords(
    artifact.value,
    artifactDigest.value,
    locator.value,
    digestPort,
  );
  if (expectedEvidence.status === ResultStatus.Failure) {
    return corrupt("Codex Compatibility Evidence 无法重新投影。", expectedEvidence.error);
  }

  const expected = sortEvidence(expectedEvidence.value);
  const loaded = sortEvidence(projection.evidence);
  const expectedDigest = digestPort.calculate(expected);
  const loadedDigest = digestPort.calculate(loaded);
  if (
    expectedDigest.status === ResultStatus.Failure ||
    loadedDigest.status === ResultStatus.Failure
  ) {
    return corrupt("Codex Compatibility Evidence 集合摘要无法重算。");
  }
  if (expectedDigest.value !== loadedDigest.value) {
    return corrupt("Codex Compatibility Evidence 与脱敏 Artifact 投影不一致。");
  }

  const inputValidation = validateExecutorCompatibilityInput({
    scope: artifact.value.scope,
    policy: createManagedFileMutationHookPolicy(),
    evidence: expected,
  });
  if (inputValidation.status === ResultStatus.Failure) {
    return corrupt("Codex Compatibility Projection 无法通过 Domain 校验。", inputValidation.error);
  }
  return success({
    artifact: artifact.value,
    artifactDigest: artifactDigest.value,
    evidence: expected,
  });
}

function parseArtifact(value: unknown): Result<CodexCompatibilityEvidenceArtifact, HarnessError> {
  const parsed = codexCompatibilityEvidenceArtifactSchema.safeParse(value);
  if (!parsed.success) {
    return corrupt("Codex Compatibility Artifact Schema 无效。", parsed.error);
  }
  try {
    return success({
      ...parsed.data,
      scope: brandScope(parsed.data.scope),
    });
  } catch (error) {
    return corrupt("Codex Compatibility Artifact Scope 摘要无效。", error);
  }
}

function parseDigest(value: string): Result<ContentDigest, HarnessError> {
  const parsed = parseContentDigest(value);
  return parsed.status === ResultStatus.Failure
    ? corrupt("Codex Compatibility Artifact 摘要格式无效。", parsed.error)
    : parsed;
}

function validateArtifactSemantics(
  artifact: CodexCompatibilityEvidenceArtifact,
): Result<void, HarnessError> {
  const [staticProbe, hostSmoke] = artifact.observations;
  if (
    artifact.profileId !== MANAGED_FILE_MUTATION_HOOK_PROFILE_ID ||
    artifact.scope.adapterKind !== ExecutorAdapterKind.Codex ||
    artifact.scope.distribution !== ExecutorDistribution.CodexCli ||
    artifact.scope.surface !== ExecutorHostSurface.InteractiveTui ||
    artifact.scope.modelId !== undefined ||
    artifact.scope.permissionMode !== undefined ||
    artifact.scope.configurationDigest === undefined ||
    !codexVersionSchema.safeParse(artifact.scope.executorVersion).success ||
    staticProbe?.kind !== CodexCompatibilityObservationKind.StaticProbe ||
    staticProbe.outcome !== ExecutorEvidenceOutcome.Passed ||
    !sameStrings(staticProbe.checkIds, CODEX_STATIC_PROBE_CHECKS) ||
    hostSmoke?.kind !== CodexCompatibilityObservationKind.HostSmoke ||
    hostSmoke.outcome !== ExecutorEvidenceOutcome.Passed ||
    !sameStrings(hostSmoke.checkIds, CODEX_HOST_SMOKE_REQUIRED_CHECKS)
  ) {
    return corrupt("Codex Compatibility Artifact 不符合受信 Projector 的固定语义。");
  }
  return success(undefined);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function brandScope(value: {
  readonly adapterKind: ExecutorHostScope["adapterKind"];
  readonly distribution: ExecutorHostScope["distribution"];
  readonly adapterDigest: string;
  readonly executorVersion: string;
  readonly surface: ExecutorHostScope["surface"];
  readonly operatingSystem: ExecutorHostScope["operatingSystem"];
  readonly architecture: ExecutorHostScope["architecture"];
  readonly modelId?: string | undefined;
  readonly permissionMode?: ExecutorHostScope["permissionMode"] | undefined;
  readonly configurationDigest?: string | undefined;
}): ExecutorHostScope {
  const adapterDigest = parseContentDigest(value.adapterDigest);
  if (adapterDigest.status === ResultStatus.Failure) throw adapterDigest.error;
  const configurationDigest =
    value.configurationDigest === undefined
      ? undefined
      : parseContentDigest(value.configurationDigest);
  if (configurationDigest?.status === ResultStatus.Failure) throw configurationDigest.error;
  return {
    adapterKind: value.adapterKind,
    distribution: value.distribution,
    adapterDigest: adapterDigest.value,
    executorVersion: value.executorVersion,
    surface: value.surface,
    operatingSystem: value.operatingSystem,
    architecture: value.architecture,
    ...(value.modelId === undefined ? {} : { modelId: value.modelId }),
    ...(value.permissionMode === undefined ? {} : { permissionMode: value.permissionMode }),
    ...(configurationDigest === undefined
      ? {}
      : { configurationDigest: configurationDigest.value }),
  };
}

function sortEvidence(
  evidence: ExecutorCompatibilityEvidenceProjection["evidence"],
): ExecutorCompatibilityEvidenceProjection["evidence"] {
  return [...evidence].sort((left, right) =>
    left.evidenceDigest.localeCompare(right.evidenceDigest),
  );
}

function corrupt<T = never>(message: string, cause?: unknown): Result<T, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.CorruptStore, message, {}, cause));
}
