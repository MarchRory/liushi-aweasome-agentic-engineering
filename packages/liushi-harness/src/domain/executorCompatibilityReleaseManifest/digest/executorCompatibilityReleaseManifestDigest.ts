import type {
  ExecutorCompatibilityReleaseArtifactReference,
  ExecutorCompatibilityReleaseManifest,
  ExecutorCompatibilityReleaseManifestDigestInput,
} from "../contracts/index.js";
import { ExecutorCompatibilityReleaseArtifactKind } from "../enums/index.js";

/** 创建排除自身摘要且 Artifact 顺序固定的 Manifest 摘要输入。 */
export function createExecutorCompatibilityReleaseManifestDigestInput(
  manifest: ExecutorCompatibilityReleaseManifest | ExecutorCompatibilityReleaseManifestDigestInput,
): ExecutorCompatibilityReleaseManifestDigestInput {
  return {
    schemaVersion: manifest.schemaVersion,
    ...(manifest.predecessorManifestDigest === undefined
      ? {}
      : { predecessorManifestDigest: manifest.predecessorManifestDigest }),
    releaseSubject: { ...manifest.releaseSubject },
    target: { ...manifest.target },
    releaseCandidateDigest: manifest.releaseCandidateDigest,
    publisherIdentityPolicyDigest: manifest.publisherIdentityPolicyDigest,
    executorScope: { ...manifest.executorScope },
    supportLevel: manifest.supportLevel,
    matrixDigest: manifest.matrixDigest,
    attestationStatementDigest: manifest.attestationStatementDigest,
    sigstoreBundleDigest: manifest.sigstoreBundleDigest,
    artifacts: normalizeExecutorCompatibilityReleaseArtifacts(manifest.artifacts),
  };
}

/** 按 Package、Bundle、Signed Attestation 的固定枚举顺序复制引用。 */
export function normalizeExecutorCompatibilityReleaseArtifacts(
  artifacts: readonly ExecutorCompatibilityReleaseArtifactReference[],
): readonly ExecutorCompatibilityReleaseArtifactReference[] {
  const order = new Map<ExecutorCompatibilityReleaseArtifactKind, number>([
    [ExecutorCompatibilityReleaseArtifactKind.PackageTarball, 0],
    [ExecutorCompatibilityReleaseArtifactKind.PublicationBundle, 1],
    [ExecutorCompatibilityReleaseArtifactKind.SignedReleaseAttestation, 2],
  ]);
  return [...artifacts]
    .map((artifact) => ({ ...artifact }))
    .sort((left, right) => (order.get(left.kind) ?? 99) - (order.get(right.kind) ?? 99));
}
