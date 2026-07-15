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
  EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
  ExecutorCapabilityQualifierKind,
  createExecutorCapabilityEvidenceDigestInput,
  validateExecutorCapabilityEvidenceDigests,
  type ExecutorCapabilityEvidence,
  type ExecutorCompatibilityDigestPort,
  type ExecutorEvidenceLocator,
} from "#domain/executorCompatibility/index.js";

import {
  CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  CODEX_EVIDENCE_PROJECTION_DEFINITIONS,
} from "../constants/index.js";
import type { CodexCompatibilityEvidenceArtifact } from "../contracts/index.js";

/** 从脱敏 Codex Artifact 确定性生成固定的规范 Evidence。 */
export function projectCodexCompatibilityEvidenceRecords(
  artifact: CodexCompatibilityEvidenceArtifact,
  artifactDigest: ContentDigest,
  locator: ExecutorEvidenceLocator,
  digestPort: ExecutorCompatibilityDigestPort,
): Result<readonly ExecutorCapabilityEvidence[], HarnessError> {
  const evidence: ExecutorCapabilityEvidence[] = [];
  for (const definition of CODEX_EVIDENCE_PROJECTION_DEFINITIONS) {
    const observation = artifact.observations.find(
      (item) => item.kind === definition.observationKind,
    );
    if (observation === undefined) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Codex compatibility evidence observation is missing.",
        ),
      );
    }
    if (!definition.checkIds.every((checkId) => observation.checkIds.includes(checkId))) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Codex compatibility evidence checks are not present in the source observation.",
        ),
      );
    }
    const withoutDigest: Omit<ExecutorCapabilityEvidence, "evidenceDigest"> = {
      schemaVersion: EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
      scope: artifact.scope,
      capability: definition.capability,
      kind: definition.evidenceKind,
      outcome: observation.outcome,
      qualifiers: [
        {
          kind: ExecutorCapabilityQualifierKind.CanonicalAction,
          value: "file_mutation",
        },
      ],
      source: {
        artifactDigest,
        locator,
        schemaVersion: CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
        checkIds: definition.checkIds,
        observedAt: observation.observedAt,
      },
    };
    const digest = digestPort.calculate(createExecutorCapabilityEvidenceDigestInput(withoutDigest));
    if (digest.status === ResultStatus.Failure) return digest;
    evidence.push({ ...withoutDigest, evidenceDigest: digest.value });
  }
  const digests = validateExecutorCapabilityEvidenceDigests(evidence, digestPort);
  return digests.status === ResultStatus.Failure ? digests : success(evidence);
}
