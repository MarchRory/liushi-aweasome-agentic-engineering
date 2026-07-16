import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import {
  EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
  ExecutorCapabilityQualifierKind,
  ExecutorEvidenceKind,
  ExecutorEvidenceLocatorKind,
  createExecutorCapabilityEvidenceDigestInput,
  validateExecutorCapabilityEvidenceDigests,
  type ExecutorCapabilityEvidence,
  type ExecutorEvidenceLocator,
} from "#domain/executorCompatibility/index.js";

import { CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION } from "../constants/index.js";
import type { CodexContractEvidenceArtifact } from "../contracts/index.js";

const SHA256_PREFIX = "sha256:";

/** 根据 Artifact Digest 构造不含绝对路径的稳定 Locator。 */
export function createCodexContractEvidenceLocator(
  kind: ExecutorEvidenceLocatorKind,
  artifactDigest: ContentDigest,
): Result<ExecutorEvidenceLocator, HarnessError> {
  const digestHex = artifactDigest.slice(SHA256_PREFIX.length);
  switch (kind) {
    case ExecutorEvidenceLocatorKind.RepositoryPath:
      return success({
        kind,
        value: `artifacts/executorCompatibility/codex/contract/${digestHex}.json`,
      });
    case ExecutorEvidenceLocatorKind.RuntimeStore:
      return success({
        kind,
        value: `executorCompatibility/codex/${digestHex}.json`,
      });
    case ExecutorEvidenceLocatorKind.ExternalUri:
      return success({ kind, value: `urn:liushi:artifact:${artifactDigest}` });
    default:
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Contract Evidence Locator 类型不受支持。"),
      );
  }
}

/** 从完整 Case Result 机械生成恰好五条 ContractTest Evidence。 */
export function projectCodexContractEvidenceRecords(
  artifact: CodexContractEvidenceArtifact,
  artifactDigest: ContentDigest,
  locator: ExecutorEvidenceLocator,
  digestPort: ContentDigestPort,
): Result<readonly ExecutorCapabilityEvidence[], HarnessError> {
  const evidence: ExecutorCapabilityEvidence[] = [];
  for (const definition of artifact.suite.cases) {
    const result = artifact.caseResults.find((item) => item.caseId === definition.caseId);
    if (result === undefined) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Contract Evidence Case Result 缺失。"),
      );
    }
    const withoutDigest: Omit<ExecutorCapabilityEvidence, "evidenceDigest"> = {
      schemaVersion: EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
      scope: artifact.scope,
      capability: definition.capability,
      kind: ExecutorEvidenceKind.ContractTest,
      outcome: result.outcome,
      qualifiers: [
        {
          kind: ExecutorCapabilityQualifierKind.CanonicalAction,
          value: "file_mutation",
        },
      ],
      source: {
        artifactDigest,
        locator,
        schemaVersion: CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
        checkIds: definition.checkIds,
        observedAt: artifact.observationAnchor,
      },
    };
    const digest = digestPort.calculate(createExecutorCapabilityEvidenceDigestInput(withoutDigest));
    if (digest.status === ResultStatus.Failure) return digest;
    evidence.push({ ...withoutDigest, evidenceDigest: digest.value });
  }
  const integrity = validateExecutorCapabilityEvidenceDigests(evidence, digestPort);
  return integrity.status === ResultStatus.Failure ? integrity : success(evidence);
}
