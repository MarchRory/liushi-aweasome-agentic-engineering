import { createExecutorCompatibilityPolicyDigestInput } from "#domain/executorCompatibility/index.js";

import type {
  ExecutorCompatibilityPublicationBundle,
  ExecutorCompatibilityPublicationBundleDigestInput,
  ExecutorCompatibilityPublishedProjection,
} from "../contracts/index.js";

/** 创建排除 Bundle Digest 自身后的稳定摘要输入。 */
export function createExecutorCompatibilityPublicationBundleDigestInput(
  bundle:
    ExecutorCompatibilityPublicationBundle | ExecutorCompatibilityPublicationBundleDigestInput,
): ExecutorCompatibilityPublicationBundleDigestInput {
  return {
    schemaVersion: bundle.schemaVersion,
    releaseSubject: { ...bundle.releaseSubject },
    matrix: bundle.matrix,
    policy: createExecutorCompatibilityPolicyDigestInput(bundle.policy),
    projections: normalizeExecutorCompatibilityPublishedProjections(bundle.projections),
  };
}

/** 对 Publication Projection 与其 Evidence 执行稳定排序。 */
export function normalizeExecutorCompatibilityPublishedProjections(
  projections: readonly ExecutorCompatibilityPublishedProjection[],
): readonly ExecutorCompatibilityPublishedProjection[] {
  return projections
    .map((projection) => ({
      artifact: projection.artifact,
      artifactDigest: projection.artifactDigest,
      evidence: [...projection.evidence].sort((left, right) =>
        compare(left.evidenceDigest, right.evidenceDigest),
      ),
    }))
    .sort((left, right) => compare(left.artifactDigest, right.artifactDigest));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
