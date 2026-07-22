import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import {
  ExecutorCompatibilityReleaseArtifactKind,
  createExecutorCompatibilityReleaseManifest,
  createExecutorCompatibilityReleaseManifestDigestInput,
  validateExecutorCompatibilityReleaseManifest,
  type CreateExecutorCompatibilityReleaseManifestInput,
  type ExecutorCompatibilityReleaseManifest,
} from "../../src/domain/executorCompatibilityReleaseManifest/index.js";
import { ExecutorSupportLevel } from "../../src/domain/executorCompatibility/index.js";
import { createExecutorCompatibilityAttestationFixture } from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Release Manifest Domain", () => {
  it("按固定 kind 顺序生成稳定 Manifest 摘要", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const first = createManifest(fixture);
    const second = createManifest(fixture);
    expect(second).toEqual(first);
    expect(first.artifacts.map((artifact) => artifact.kind)).toEqual([
      ExecutorCompatibilityReleaseArtifactKind.PackageTarball,
      ExecutorCompatibilityReleaseArtifactKind.PublicationBundle,
      ExecutorCompatibilityReleaseArtifactKind.SignedReleaseAttestation,
    ]);
    expect(
      createExecutorCompatibilityReleaseManifestDigestInput({
        ...first,
        artifacts: [...first.artifacts].reverse(),
      }).artifacts,
    ).toEqual(first.artifacts);
  });

  it("绑定 Draft 的所有重复字段和 package/bundle Artifact 摘要", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const manifest = createManifest(fixture);
    const otherDigest = digest(fixture, { other: true });
    const [packageTarball, publicationBundle, signedReleaseAttestation] = artifactsOf(manifest);
    const cases: readonly ExecutorCompatibilityReleaseManifest[] = [
      { ...manifest, releaseSubject: { ...manifest.releaseSubject, packageName: "other" } },
      { ...manifest, target: { ...manifest.target, uri: "https://registry.npmjs.org/other" } },
      { ...manifest, releaseCandidateDigest: otherDigest },
      { ...manifest, publisherIdentityPolicyDigest: otherDigest },
      { ...manifest, executorScope: { ...manifest.executorScope, executorVersion: "other" } },
      { ...manifest, supportLevel: ExecutorSupportLevel.Unsupported },
      { ...manifest, matrixDigest: otherDigest },
      { ...manifest, attestationStatementDigest: otherDigest },
      {
        ...manifest,
        artifacts: [
          { ...packageTarball, digest: otherDigest },
          publicationBundle,
          signedReleaseAttestation,
        ],
      },
      {
        ...manifest,
        artifacts: [
          packageTarball,
          { ...publicationBundle, digest: otherDigest },
          signedReleaseAttestation,
        ],
      },
    ];
    for (const candidate of cases) {
      expect(
        validateExecutorCompatibilityReleaseManifest(
          candidate,
          draftFor(fixture),
          bindingFor(fixture),
          fixture.digest,
        ).status,
      ).toBe(ResultStatus.Failure);
    }
  });

  it("即使重算 Manifest 摘要也拒绝 P3b 签名证明绑定漂移", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const manifest = createManifest(fixture);
    const otherDigest = digest(fixture, { forgedSignedAttestation: true });
    const [packageTarball, publicationBundle, signedReleaseAttestation] = artifactsOf(manifest);
    const cases: readonly ExecutorCompatibilityReleaseManifest[] = [
      {
        ...manifest,
        artifacts: [
          packageTarball,
          publicationBundle,
          { ...signedReleaseAttestation, digest: otherDigest },
        ],
      },
      { ...manifest, sigstoreBundleDigest: otherDigest },
    ];
    for (const candidate of cases) {
      const recomputed = {
        ...candidate,
        manifestDigest: digest(
          fixture,
          createExecutorCompatibilityReleaseManifestDigestInput(candidate),
        ),
      };
      expect(
        validateExecutorCompatibilityReleaseManifest(
          recomputed,
          draftFor(fixture),
          bindingFor(fixture),
          fixture.digest,
        ).status,
      ).toBe(ResultStatus.Failure);
    }
  });

  it("保留 predecessor，并拒绝缺失、重复或非规范顺序的 kind", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const predecessor = digest(fixture, { predecessor: true });
    const manifest = createManifest(fixture, { predecessorManifestDigest: predecessor });
    expect(manifest.predecessorManifestDigest).toBe(predecessor);

    const reversed = { ...manifest, artifacts: [...manifest.artifacts].reverse() };
    expect(
      validateExecutorCompatibilityReleaseManifest(
        reversed,
        draftFor(fixture),
        bindingFor(fixture),
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      validateExecutorCompatibilityReleaseManifest(
        { ...manifest, artifacts: manifest.artifacts.slice(0, 2) },
        draftFor(fixture),
        bindingFor(fixture),
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      createExecutorCompatibilityReleaseManifest(
        {
          ...inputFor(fixture),
          packageTarball: {
            ...inputFor(fixture).packageTarball,
            kind: ExecutorCompatibilityReleaseArtifactKind.PublicationBundle,
          },
        },
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
  });

  it.each([
    "http://registry.npmjs.org/package.tgz",
    "https://user:secret@example.com/package.tgz",
    "https://example.com/package.tgz?token=secret",
    "https://example.com/package.tgz#fragment",
    "https://example.com/package.tgz/",
    "https://example.com",
  ])("拒绝非 canonical Artifact URI: %s", async (uri) => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const input = inputFor(fixture);
    expect(
      createExecutorCompatibilityReleaseManifest(
        { ...input, packageTarball: { ...input.packageTarball, uri } },
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
  });

  it("只限制正安全整数，不设置 byteLength 上限", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const input = inputFor(fixture);
    expect(
      createExecutorCompatibilityReleaseManifest(
        {
          ...input,
          packageTarball: { ...input.packageTarball, byteLength: Number.MAX_SAFE_INTEGER },
        },
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Success);
    for (const byteLength of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        createExecutorCompatibilityReleaseManifest(
          { ...input, packageTarball: { ...input.packageTarball, byteLength } },
          fixture.digest,
        ).status,
      ).toBe(ResultStatus.Failure);
    }
  });

  it("拒绝 unknown、Draft tamper、Statement 摘要漂移和 Manifest 摘要漂移", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const input = inputFor(fixture);
    expect(
      createExecutorCompatibilityReleaseManifest(
        { ...input, unexpected: true } as never,
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      createExecutorCompatibilityReleaseManifest({ ...input, draft: fixture }, fixture.digest)
        .status,
    ).toBe(ResultStatus.Failure);
    expect(
      createExecutorCompatibilityReleaseManifest(
        {
          ...input,
          verifiedAttestation: {
            ...input.verifiedAttestation,
            statementDigest: digest(fixture, { forgedStatement: true }),
          },
        },
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    const manifest = createManifest(fixture);
    expect(
      validateExecutorCompatibilityReleaseManifest(
        { ...manifest, unexpected: true },
        draftFor(fixture),
        bindingFor(fixture),
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      validateExecutorCompatibilityReleaseManifest(
        { ...manifest, manifestDigest: digest(fixture, { forgedManifest: true }) },
        draftFor(fixture),
        bindingFor(fixture),
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    const tamperedDraft = {
      ...draftFor(fixture),
      g6Approval: {
        ...fixture.g6Approval,
        approvalRecordDigest: digest(fixture, { forgedApproval: true }),
      },
    };
    expect(
      validateExecutorCompatibilityReleaseManifest(
        manifest,
        tamperedDraft,
        bindingFor(fixture),
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
  });
});

function createManifest(
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityAttestationFixture>>,
  overrides: Partial<CreateExecutorCompatibilityReleaseManifestInput> = {},
): ExecutorCompatibilityReleaseManifest {
  const result = createExecutorCompatibilityReleaseManifest(
    { ...inputFor(fixture), ...overrides },
    fixture.digest,
  );
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function inputFor(
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityAttestationFixture>>,
): CreateExecutorCompatibilityReleaseManifestInput {
  const verifiedAttestation = bindingFor(fixture);
  return {
    draft: draftFor(fixture),
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
  };
}

function bindingFor(
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityAttestationFixture>>,
) {
  return {
    artifactDigest: digest(fixture, { signedReleaseAttestation: true }),
    statementDigest: digest(fixture, fixture.statement),
    sigstoreBundleDigest: digest(fixture, { sigstoreBundle: true }),
  } as const;
}

function draftFor(
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityAttestationFixture>>,
) {
  return {
    bundle: fixture.bundle,
    publisherIdentityPolicy: fixture.publisherIdentityPolicy,
    releaseCandidate: fixture.releaseCandidate,
    decisionRequest: fixture.decisionRequest,
    approvalRecord: fixture.approvalRecord,
    g6Approval: fixture.g6Approval,
    statement: fixture.statement,
  };
}

function artifactsOf(
  manifest: ExecutorCompatibilityReleaseManifest,
): [
  ExecutorCompatibilityReleaseManifest["artifacts"][number],
  ExecutorCompatibilityReleaseManifest["artifacts"][number],
  ExecutorCompatibilityReleaseManifest["artifacts"][number],
] {
  const [packageTarball, publicationBundle, signedReleaseAttestation] = manifest.artifacts;
  if (
    packageTarball === undefined ||
    publicationBundle === undefined ||
    signedReleaseAttestation === undefined
  ) {
    throw new Error("Release Manifest fixture 缺少 Artifact。");
  }
  return [packageTarball, publicationBundle, signedReleaseAttestation];
}

function digest(
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityAttestationFixture>>,
  input: unknown,
) {
  const result = fixture.digest.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
