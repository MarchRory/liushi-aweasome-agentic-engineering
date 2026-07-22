import { ResultStatus } from "../../../src/common/index.js";
import {
  ExecutorCompatibilityReleaseArtifactKind,
  createExecutorCompatibilityReleaseManifest,
  type ExecutorCompatibilityVerifiedReleaseAttestationBinding,
} from "../../../src/domain/executorCompatibilityReleaseManifest/index.js";

import { createExecutorCompatibilityAttestationFixture } from "./executorCompatibilityAttestationFixture.js";

async function createReleaseManifestFixture() {
  const fixture = await createExecutorCompatibilityAttestationFixture();
  const verifiedAttestation: ExecutorCompatibilityVerifiedReleaseAttestationBinding = {
    artifactDigest: digest(fixture, { signedReleaseAttestation: true }),
    statementDigest: digest(fixture, fixture.statement),
    sigstoreBundleDigest: digest(fixture, { sigstoreBundle: true }),
  };
  const manifest = createExecutorCompatibilityReleaseManifest(
    {
      draft: {
        bundle: fixture.bundle,
        publisherIdentityPolicy: fixture.publisherIdentityPolicy,
        releaseCandidate: fixture.releaseCandidate,
        decisionRequest: fixture.decisionRequest,
        approvalRecord: fixture.approvalRecord,
        g6Approval: fixture.g6Approval,
        statement: fixture.statement,
      },
      packageTarball: {
        kind: ExecutorCompatibilityReleaseArtifactKind.PackageTarball,
        uri: "https://registry.npmjs.org/liushi-harness/-/liushi-harness-0.0.0.tgz",
        digest: fixture.releaseSubject.packageDigest,
        byteLength: 1,
      },
      publicationBundle: {
        kind: ExecutorCompatibilityReleaseArtifactKind.PublicationBundle,
        uri: "https://github.com/MarchRory/liushi-aweasome-agentic-engineering/releases/bundle.json",
        digest: fixture.bundle.bundleDigest,
        byteLength: 1,
      },
      signedReleaseAttestation: {
        kind: ExecutorCompatibilityReleaseArtifactKind.SignedReleaseAttestation,
        uri: "https://github.com/MarchRory/liushi-aweasome-agentic-engineering/releases/attestation.bundle",
        digest: verifiedAttestation.artifactDigest,
        byteLength: 1,
      },
      verifiedAttestation,
    },
    fixture.digest,
  );
  if (manifest.status === ResultStatus.Failure) throw manifest.error;
  return { ...fixture, manifest: manifest.value, verifiedAttestation };
}

/** P4a Release Manifest Fixture 的稳定静态类型。 */
export type ExecutorCompatibilityReleaseManifestFixture = Awaited<
  ReturnType<typeof createReleaseManifestFixture>
>;

/** 创建包含 P4a Manifest 与 P3b 摘要绑定的稳定 Fixture。 */
export function createExecutorCompatibilityReleaseManifestFixture(): Promise<ExecutorCompatibilityReleaseManifestFixture> {
  return createReleaseManifestFixture();
}

function digest(
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityAttestationFixture>>,
  input: unknown,
) {
  const result = fixture.digest.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
