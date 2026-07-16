import type { ZodError } from "zod";

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
  createExecutorCapabilityEvidenceDigestInput,
  validateExecutorCompatibilityMatrix,
  type ExecutorCapabilityEvidence,
} from "#domain/executorCompatibility/index.js";

import type {
  ExecutorCompatibilityPublicationBundle,
  ExecutorCompatibilityPublicationBundleDigestInput,
  ExecutorCompatibilityPublicationDigestPort,
  ExecutorCompatibilityPublishedProjection,
} from "../contracts/index.js";
import { createExecutorCompatibilityPublicationBundleDigestInput } from "../digest/index.js";
import {
  executorCompatibilityPublicationBundleDigestInputSchema,
  executorCompatibilityPublicationBundleSchema,
} from "../schemas/index.js";

/** 校验不含自身摘要的 Publication Bundle 候选。 */
export function validateExecutorCompatibilityPublicationBundleDigestInput(
  input: unknown,
  digestPort: ExecutorCompatibilityPublicationDigestPort,
): Result<ExecutorCompatibilityPublicationBundleDigestInput, HarnessError> {
  const parsed = executorCompatibilityPublicationBundleDigestInputSchema.safeParse(input);
  if (!parsed.success) return invalidSchema(parsed.error);
  const candidate = parsed.data as unknown as ExecutorCompatibilityPublicationBundleDigestInput;
  const semantics = validateSemantics(candidate, digestPort);
  return semantics.status === ResultStatus.Failure ? semantics : success(candidate);
}

/** 校验完整 Publication Bundle 的结构、语义、顺序与摘要。 */
export function validateExecutorCompatibilityPublicationBundle(
  input: unknown,
  digestPort: ExecutorCompatibilityPublicationDigestPort,
): Result<ExecutorCompatibilityPublicationBundle, HarnessError> {
  const parsed = executorCompatibilityPublicationBundleSchema.safeParse(input);
  if (!parsed.success) return invalidSchema(parsed.error);
  const bundle = parsed.data as unknown as ExecutorCompatibilityPublicationBundle;
  const semantics = validateSemantics(bundle, digestPort);
  if (semantics.status === ResultStatus.Failure) return semantics;
  if (!isCanonicalProjectionOrder(bundle.projections)) {
    return invalid("Executor Compatibility Publication Projection 未按摘要稳定排序。");
  }
  const digest = digestPort.calculate(
    createExecutorCompatibilityPublicationBundleDigestInput(bundle),
  );
  if (digest.status === ResultStatus.Failure) return digest;
  return digest.value === bundle.bundleDigest
    ? success(bundle)
    : invalid("Executor Compatibility Publication Bundle 摘要漂移。", {
        expectedBundleDigest: digest.value,
        actualBundleDigest: bundle.bundleDigest,
      });
}

function validateSemantics(
  candidate: ExecutorCompatibilityPublicationBundleDigestInput,
  digestPort: ExecutorCompatibilityPublicationDigestPort,
): Result<void, HarnessError> {
  if (candidate.releaseSubject.packageDigest !== candidate.matrix.scope.adapterDigest) {
    return invalid("Publication Tarball Digest 与 Matrix Adapter Digest 不一致。", {
      packageDigest: candidate.releaseSubject.packageDigest,
      adapterDigest: candidate.matrix.scope.adapterDigest,
    });
  }

  const projectionValidation = validateProjections(candidate.projections, digestPort);
  if (projectionValidation.status === ResultStatus.Failure) return projectionValidation;
  const matrixValidation = validateExecutorCompatibilityMatrix(
    candidate.matrix,
    candidate.policy,
    projectionValidation.value,
    digestPort,
  );
  return matrixValidation.status === ResultStatus.Failure ? matrixValidation : success(undefined);
}

function validateProjections(
  projections: readonly ExecutorCompatibilityPublishedProjection[],
  digestPort: ExecutorCompatibilityPublicationDigestPort,
): Result<readonly ExecutorCapabilityEvidence[], HarnessError> {
  const artifactDigests = new Set<ContentDigest>();
  const evidenceDigests = new Set<ContentDigest>();
  for (const projection of projections) {
    if (artifactDigests.has(projection.artifactDigest)) {
      return invalid("Publication Bundle 包含重复 Artifact Projection。", {
        artifactDigest: projection.artifactDigest,
      });
    }
    artifactDigests.add(projection.artifactDigest);
    const artifactDigest = digestPort.calculate(projection.artifact);
    if (artifactDigest.status === ResultStatus.Failure) return artifactDigest;
    if (artifactDigest.value !== projection.artifactDigest) {
      return invalid("Publication Artifact Digest 与内容不一致。", {
        expectedArtifactDigest: artifactDigest.value,
        actualArtifactDigest: projection.artifactDigest,
      });
    }
    for (const evidence of projection.evidence) {
      if (evidence.source.artifactDigest !== projection.artifactDigest) {
        return invalid("Publication Evidence 未绑定所属 Artifact。", {
          evidenceDigest: evidence.evidenceDigest,
          artifactDigest: projection.artifactDigest,
          sourceArtifactDigest: evidence.source.artifactDigest,
        });
      }
      if (evidenceDigests.has(evidence.evidenceDigest)) {
        return invalid("Publication Bundle 包含重复 Evidence。", {
          evidenceDigest: evidence.evidenceDigest,
        });
      }
      evidenceDigests.add(evidence.evidenceDigest);
      const evidenceDigest = digestPort.calculate(
        createExecutorCapabilityEvidenceDigestInput(evidence),
      );
      if (evidenceDigest.status === ResultStatus.Failure) return evidenceDigest;
      if (evidenceDigest.value !== evidence.evidenceDigest) {
        return invalid("Publication Evidence Digest 与内容不一致。", {
          expectedEvidenceDigest: evidenceDigest.value,
          actualEvidenceDigest: evidence.evidenceDigest,
        });
      }
    }
  }
  return success(flattenEvidence(projections));
}

function flattenEvidence(
  projections: readonly ExecutorCompatibilityPublishedProjection[],
): readonly ExecutorCapabilityEvidence[] {
  return projections.flatMap((projection) => projection.evidence);
}

function isCanonicalProjectionOrder(
  projections: readonly ExecutorCompatibilityPublishedProjection[],
): boolean {
  return (
    isSorted(projections.map((projection) => projection.artifactDigest)) &&
    projections.every((projection) =>
      isSorted(projection.evidence.map((evidence) => evidence.evidenceDigest)),
    )
  );
}

function isSorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || (values[index - 1] ?? "") < value);
}

function invalidSchema(error: ZodError): Result<never, HarnessError> {
  const issue = error.issues[0];
  return invalid("Executor Compatibility Publication Bundle Schema 非法。", {
    path: issue?.path.join(".") ?? "unknown",
    issue: issue?.message ?? "unknown",
  });
}

function invalid(
  message: string,
  details: Readonly<Record<string, string>> = {},
): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, details));
}
