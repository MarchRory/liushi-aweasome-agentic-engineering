import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type { ExecutorCompatibilityEvidenceProjection } from "#application/ports/executorCompatibilityEvidenceProjectionVerifier/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import {
  ExecutorEvidenceLocatorKind,
  createManagedFileMutationHookPolicy,
  validateExecutorCompatibilityInput,
  type ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";

import type {
  CodexContractEvidenceArtifact,
  CodexContractEvidenceProjection,
} from "../contracts/index.js";
import {
  createCodexContractEvidenceLocator,
  projectCodexContractEvidenceRecords,
} from "../evidenceRecords/index.js";
import {
  codexContractEvidenceArtifactSchema,
  codexContractEvidenceProjectionSchema,
} from "../schemas/index.js";
import { validateCodexContractArtifactSemantics } from "./codexContractSemantics.validation.js";

/** 对持久化 Contract Projection 执行严格解析、重算与 Domain 关闭式校验。 */
export function verifyPersistedCodexContractProjection(
  projection: ExecutorCompatibilityEvidenceProjection,
  digestPort: ContentDigestPort,
): Result<CodexContractEvidenceProjection, HarnessError> {
  const parsedProjection = codexContractEvidenceProjectionSchema.safeParse(projection);
  if (!parsedProjection.success) {
    return corrupt("Codex Contract Evidence Projection Schema 无效。", parsedProjection.error);
  }
  const artifact = parseArtifact(parsedProjection.data.artifact);
  if (artifact.status === ResultStatus.Failure) return artifact;
  const semantics = validateCodexContractArtifactSemantics(artifact.value);
  if (semantics.status === ResultStatus.Failure) {
    return corrupt("Codex Contract Evidence Artifact 语义无效。", semantics.error);
  }

  const suiteDigest = digestPort.calculate({
    suiteId: artifact.value.suite.suiteId,
    version: artifact.value.suite.version,
    cases: artifact.value.suite.cases,
  });
  if (suiteDigest.status === ResultStatus.Failure) {
    return corrupt("Codex Contract Suite Definition Digest 无法重算。", suiteDigest.error);
  }
  if (suiteDigest.value !== artifact.value.suite.definitionDigest) {
    return corrupt("Codex Contract Suite Definition Digest 不匹配。");
  }

  const artifactDigest = parsePersistedDigest(parsedProjection.data.artifactDigest);
  if (artifactDigest.status === ResultStatus.Failure) return artifactDigest;
  const recalculatedArtifactDigest = digestPort.calculate(artifact.value);
  if (recalculatedArtifactDigest.status === ResultStatus.Failure) {
    return corrupt(
      "Codex Contract Evidence Artifact Digest 无法重算。",
      recalculatedArtifactDigest.error,
    );
  }
  if (recalculatedArtifactDigest.value !== artifactDigest.value) {
    return corrupt("Codex Contract Evidence Artifact Digest 不匹配。");
  }

  if (
    !parsedProjection.data.evidence.every(
      (item) => item.source.locator.kind === ExecutorEvidenceLocatorKind.RuntimeStore,
    )
  ) {
    return corrupt("持久化 Codex Contract Evidence Locator 边界无效。");
  }
  const locator = createCodexContractEvidenceLocator(
    ExecutorEvidenceLocatorKind.RuntimeStore,
    artifactDigest.value,
  );
  if (locator.status === ResultStatus.Failure) {
    return corrupt("Codex Contract Evidence Locator 无法重建。", locator.error);
  }
  const expectedEvidence = projectCodexContractEvidenceRecords(
    artifact.value,
    artifactDigest.value,
    locator.value,
    digestPort,
  );
  if (expectedEvidence.status === ResultStatus.Failure) {
    return corrupt("Codex Contract Evidence 无法重新投影。", expectedEvidence.error);
  }

  const expectedRecordsDigest = digestPort.calculate(expectedEvidence.value);
  const loadedRecordsDigest = digestPort.calculate(parsedProjection.data.evidence);
  if (
    expectedRecordsDigest.status === ResultStatus.Failure ||
    loadedRecordsDigest.status === ResultStatus.Failure
  ) {
    return corrupt("Codex Contract Evidence 记录摘要无法重算。");
  }
  if (expectedRecordsDigest.value !== loadedRecordsDigest.value) {
    return corrupt("Codex Contract Evidence 与 Artifact 投影不一致。");
  }

  const domainValidation = validateExecutorCompatibilityInput({
    scope: artifact.value.scope,
    policy: createManagedFileMutationHookPolicy(),
    evidence: expectedEvidence.value,
  });
  if (domainValidation.status === ResultStatus.Failure) {
    return corrupt(
      "Codex Contract Evidence 未通过固定 Policy Domain 校验。",
      domainValidation.error,
    );
  }
  return success({
    artifact: artifact.value,
    artifactDigest: artifactDigest.value,
    evidence: expectedEvidence.value,
  });
}

function parseArtifact(value: unknown): Result<CodexContractEvidenceArtifact, HarnessError> {
  const parsed = codexContractEvidenceArtifactSchema.safeParse(value);
  if (!parsed.success) {
    return corrupt("Codex Contract Evidence Artifact Schema 无效。", parsed.error);
  }
  const scope = brandScope(parsed.data.scope);
  if (scope.status === ResultStatus.Failure) return scope;
  const hostArtifactDigest = parsePersistedDigest(parsed.data.hostArtifactDigest);
  if (hostArtifactDigest.status === ResultStatus.Failure) return hostArtifactDigest;
  const definitionDigest = parsePersistedDigest(parsed.data.suite.definitionDigest);
  if (definitionDigest.status === ResultStatus.Failure) return definitionDigest;
  return success({
    ...parsed.data,
    scope: scope.value,
    hostArtifactDigest: hostArtifactDigest.value,
    suite: {
      ...parsed.data.suite,
      definitionDigest: definitionDigest.value,
    },
  });
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
}): Result<ExecutorHostScope, HarnessError> {
  const adapterDigest = parsePersistedDigest(value.adapterDigest);
  if (adapterDigest.status === ResultStatus.Failure) return adapterDigest;
  const configurationDigest =
    value.configurationDigest === undefined
      ? undefined
      : parsePersistedDigest(value.configurationDigest);
  if (configurationDigest?.status === ResultStatus.Failure) return configurationDigest;
  return success({
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
  });
}

function parsePersistedDigest(value: string): Result<ContentDigest, HarnessError> {
  const parsed = parseContentDigest(value);
  return parsed.status === ResultStatus.Failure
    ? corrupt("Codex Contract Evidence Digest 格式无效。", parsed.error)
    : parsed;
}

function corrupt<T = never>(message: string, cause?: unknown): Result<T, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.CorruptStore, message, {}, cause));
}
