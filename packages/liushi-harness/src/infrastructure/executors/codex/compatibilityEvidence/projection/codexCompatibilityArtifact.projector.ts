import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import {
  ExecutorAdapterKind,
  ExecutorDistribution,
  ExecutorEvidenceOutcome,
  ExecutorHostSurface,
  MANAGED_FILE_MUTATION_HOOK_PROFILE_ID,
  type ExecutorCompatibilityDigestPort,
  type ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";

import {
  CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  CODEX_HOST_SMOKE_REQUIRED_CHECKS,
  CODEX_STATIC_PROBE_CHECKS,
} from "../constants/index.js";
import type { CodexCompatibilityEvidenceArtifact } from "../contracts/index.js";
import { CodexCompatibilityObservationKind } from "../enums/index.js";
import { mapCodexHostPlatform } from "../platform/index.js";
import { codexCompatibilityEvidenceArtifactSchema } from "../schemas/index.js";
import type { ValidatedCodexCompatibilitySource } from "../validation/index.js";

/** 从已校验来源生成不含绝对路径和宿主原始标识的 Artifact。 */
export function projectCodexCompatibilityArtifact(
  source: ValidatedCodexCompatibilitySource,
  digestPort: ExecutorCompatibilityDigestPort,
): Result<
  {
    readonly artifact: CodexCompatibilityEvidenceArtifact;
    readonly artifactDigest: ContentDigest;
  },
  HarnessError
> {
  const platform = mapCodexHostPlatform(
    source.hostResult.verificationEnvironment.platform,
    source.hostResult.verificationEnvironment.architecture,
  );
  if (platform.status === ResultStatus.Failure) return platform;

  const scope: ExecutorHostScope = {
    adapterKind: ExecutorAdapterKind.Codex,
    distribution: ExecutorDistribution.CodexCli,
    adapterDigest: source.prepareManifest.package.artifact.sha256,
    executorVersion: source.prepareManifest.codexProbe.version,
    surface: ExecutorHostSurface.InteractiveTui,
    operatingSystem: platform.value.operatingSystem,
    architecture: platform.value.architecture,
    configurationDigest: source.prepareManifest.candidateHookConfig.digest,
  };
  const artifact: CodexCompatibilityEvidenceArtifact = {
    schemaVersion: CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
    profileId: MANAGED_FILE_MUTATION_HOOK_PROFILE_ID,
    scope,
    sourceDigests: {
      prepareManifest: source.prepareManifestDigest,
      activationPlan: source.activationPlanDigest,
      staticProbe: source.staticProbeDigest,
      hostResult: source.hostResultDigest,
      activation: source.hostResult.activationDigest,
    },
    observations: [
      {
        kind: CodexCompatibilityObservationKind.StaticProbe,
        observedAt: source.prepareManifest.generatedAt,
        outcome: ExecutorEvidenceOutcome.Passed,
        checkIds: CODEX_STATIC_PROBE_CHECKS,
      },
      {
        kind: CodexCompatibilityObservationKind.HostSmoke,
        observedAt: source.hostResult.verifiedAt,
        outcome: ExecutorEvidenceOutcome.Passed,
        checkIds: CODEX_HOST_SMOKE_REQUIRED_CHECKS,
      },
    ],
  };
  const parsed = codexCompatibilityEvidenceArtifactSchema.safeParse(artifact);
  if (!parsed.success) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Codex compatibility evidence artifact schema is invalid.",
      ),
    );
  }
  const artifactDigest = digestPort.calculate(artifact);
  if (artifactDigest.status === ResultStatus.Failure) return artifactDigest;
  return success({ artifact, artifactDigest: artifactDigest.value });
}
