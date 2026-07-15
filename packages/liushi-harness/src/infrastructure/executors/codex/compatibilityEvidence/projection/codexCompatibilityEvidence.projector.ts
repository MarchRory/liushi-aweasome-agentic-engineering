import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";
import {
  EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
  ExecutorCapabilityQualifierKind,
  createExecutorCapabilityEvidenceDigestInput,
  createManagedFileMutationHookPolicy,
  validateExecutorCapabilityEvidenceDigests,
  validateExecutorCompatibilityInput,
  type ExecutorCapabilityEvidence,
  type ExecutorCompatibilityDigestPort,
  type ExecutorEvidenceLocator,
} from "#domain/executorCompatibility/index.js";

import {
  CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  CODEX_EVIDENCE_PROJECTION_DEFINITIONS,
} from "../constants/index.js";
import type {
  CodexCompatibilityEvidenceProjection,
  CodexCompatibilityEvidenceProjector,
  ProjectCodexCompatibilityEvidenceInput,
} from "../contracts/index.js";
import { createCodexCompatibilityEvidenceLocator } from "../locators/index.js";
import { validateCodexCompatibilitySource } from "../validation/index.js";
import { projectCodexCompatibilityArtifact } from "./codexCompatibilityArtifact.projector.js";

/** 将受验 Codex Host Packet 投影为可由 Domain Compiler 消费的证据。 */
export class CodexCompatibilityEvidenceProjectorAdapter implements CodexCompatibilityEvidenceProjector {
  /** 注入 RFC 8785 摘要端口，确保 Artifact 与 Evidence 使用同一算法。 */
  public constructor(private readonly digestPort: ExecutorCompatibilityDigestPort) {}

  /** 关闭式校验原始来源，只输出当前来源实际证明的证据等级。 */
  public project(
    input: ProjectCodexCompatibilityEvidenceInput,
  ): Result<CodexCompatibilityEvidenceProjection, HarnessError> {
    const validated = validateCodexCompatibilitySource(input, this.digestPort);
    if (validated.status === ResultStatus.Failure) return validated;
    const artifactProjection = projectCodexCompatibilityArtifact(validated.value, this.digestPort);
    if (artifactProjection.status === ResultStatus.Failure) return artifactProjection;
    const locator = createCodexCompatibilityEvidenceLocator(
      input.artifactLocatorKind,
      artifactProjection.value.artifactDigest,
    );
    if (locator.status === ResultStatus.Failure) return locator;

    const evidence = this.projectEvidence(
      artifactProjection.value.artifact.scope,
      artifactProjection.value.artifactDigest,
      artifactProjection.value.artifact.observations,
      locator.value,
    );
    if (evidence.status === ResultStatus.Failure) return evidence;

    const policy = createManagedFileMutationHookPolicy();
    const inputValidation = validateExecutorCompatibilityInput({
      scope: artifactProjection.value.artifact.scope,
      policy,
      evidence: evidence.value,
    });
    if (inputValidation.status === ResultStatus.Failure) return inputValidation;
    const digestValidation = validateExecutorCapabilityEvidenceDigests(
      evidence.value,
      this.digestPort,
    );
    if (digestValidation.status === ResultStatus.Failure) return digestValidation;

    return success({
      artifact: artifactProjection.value.artifact,
      artifactDigest: artifactProjection.value.artifactDigest,
      evidence: evidence.value,
    });
  }

  private projectEvidence(
    scope: CodexCompatibilityEvidenceProjection["artifact"]["scope"],
    artifactDigest: CodexCompatibilityEvidenceProjection["artifactDigest"],
    observations: CodexCompatibilityEvidenceProjection["artifact"]["observations"],
    locator: ExecutorEvidenceLocator,
  ): Result<readonly ExecutorCapabilityEvidence[], HarnessError> {
    const evidence: ExecutorCapabilityEvidence[] = [];
    for (const definition of CODEX_EVIDENCE_PROJECTION_DEFINITIONS) {
      const observation = observations.find((item) => item.kind === definition.observationKind);
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
        scope,
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
      const digest = this.digestPort.calculate(
        createExecutorCapabilityEvidenceDigestInput(withoutDigest),
      );
      if (digest.status === ResultStatus.Failure) return digest;
      evidence.push({ ...withoutDigest, evidenceDigest: digest.value });
    }
    return success(evidence);
  }
}
