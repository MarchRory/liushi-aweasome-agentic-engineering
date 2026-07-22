import { describe, expect, it, vi } from "vitest";

import { createExecutorCompatibilitySignedReleaseManifestArtifact } from "../../src/application/executorCompatibilityReleaseManifestAttestation/index.js";
import type { ExecutorCompatibilityAttestationVerifierPort } from "../../src/application/ports/index.js";
import { VerifyExecutorCompatibilityReleaseManifestUseCase } from "../../src/application/useCases/verifyExecutorCompatibilityReleaseManifest/index.js";
import { ResultStatus, success, type ContentDigest } from "../../src/common/index.js";
import {
  createExecutorCompatibilityPublisherTrustPolicy,
  createExecutorCompatibilityReleaseTrustProfile,
} from "../../src/domain/executorCompatibilityReleaseTrust/index.js";
import {
  ExecutorCompatibilityPublicationTargetKind,
  SIGSTORE_RUNNER_ENVIRONMENT_OID,
} from "../../src/domain/executorCompatibilityAttestation/index.js";
import {
  createExecutorCompatibilityReleaseManifest,
  type ExecutorCompatibilityReleaseManifest,
} from "../../src/domain/executorCompatibilityReleaseManifest/index.js";
import { createExecutorCompatibilityReleaseManifestAttestationDraft } from "../../src/domain/executorCompatibilityReleaseManifestAttestation/index.js";
import { ExecutorSupportLevel } from "../../src/domain/executorCompatibility/index.js";
import {
  createExecutorCompatibilityReleaseManifestAttestationFixture,
  createExecutorCompatibilitySigstoreBundleStub,
  createExecutorCompatibilityTrustedRootStub,
  createSignedAttestationArtifactForFixture,
  createStrictExecutorCompatibilityAttestationDraft,
  createVerifiedSignerIdentityStub,
  type ExecutorCompatibilityReleaseManifestAttestationFixture,
  withManifestApprovalRecordDigest,
  withManifestDecisionRequestDigest,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Signed Release Manifest Verification", () => {
  it("以同一 Verifier 完整复验 Manifest 与 P3b，并返回窄回执", async () => {
    const fixture = await createVerificationFixture();
    const verify = verifierReturning(fixture.signerIdentity);
    const useCase = new VerifyExecutorCompatibilityReleaseManifestUseCase(
      { verify },
      fixture.digest,
    );

    const result = await useCase.execute(fixture.input);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) throw result.error;
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[0]?.[0]).toMatchObject({
      sigstoreBundle: fixture.manifestArtifact.sigstoreBundle,
      trustedRoot: fixture.trustedRoot,
      statement: fixture.manifestArtifact.draft.statement,
      publisherIdentityPolicy: fixture.derivedPolicy,
    });
    expect(verify.mock.calls[1]?.[0]).toMatchObject({
      sigstoreBundle: fixture.releaseAttestationArtifact.sigstoreBundle,
      trustedRoot: fixture.trustedRoot,
      statement: fixture.releaseAttestationArtifact.draft.statement,
      publisherIdentityPolicy: fixture.derivedPolicy,
    });
    expect(result.value).toEqual({
      schemaVersion: "liushi.executor-compatibility-release-manifest-verification-receipt.v1",
      manifestArtifactDigest: fixture.manifestArtifact.artifactDigest,
      manifestStatementDigest: fixture.manifestArtifact.statementDigest,
      manifestSigstoreBundleDigest: fixture.manifestArtifact.sigstoreBundleDigest,
      manifestDigest: fixture.manifest.manifestDigest,
      releaseAttestationArtifactDigest: fixture.releaseAttestationArtifact.artifactDigest,
      releaseAttestationStatementDigest: fixture.releaseAttestationArtifact.statementDigest,
      releaseAttestationSigstoreBundleDigest:
        fixture.releaseAttestationArtifact.sigstoreBundleDigest,
      releaseCandidateDigest: fixture.releaseCandidate.candidateDigest,
      publisherIdentityPolicyDigest: fixture.derivedPolicy.identityPolicyDigest,
      profileDigest: fixture.trustProfile.profileDigest,
      trustedRootDigest: fixture.trustedRootDigest,
      signerIdentity: fixture.signerIdentity,
    });
  });

  it("Trust Profile 钉住的 Root 摘要不匹配时不调用 Verifier", async () => {
    const fixture = await createVerificationFixture();
    const verify = verifierReturning(fixture.signerIdentity);
    const result = await new VerifyExecutorCompatibilityReleaseManifestUseCase(
      { verify },
      fixture.digest,
    ).execute({
      ...fixture.input,
      trustedRoot: createExecutorCompatibilityTrustedRootStub("other"),
    });

    expect(result.status).toBe(ResultStatus.Failure);
    expect(verify).not.toHaveBeenCalled();
  });

  it("外部 Manifest 摘要不匹配时在签名验证前关闭失败", async () => {
    const fixture = await createVerificationFixture();
    const verify = verifierReturning(fixture.signerIdentity);
    const result = await new VerifyExecutorCompatibilityReleaseManifestUseCase(
      { verify },
      fixture.digest,
    ).execute({ ...fixture.input, expectedManifestDigest: digest(fixture, { forged: true }) });

    expect(result.status).toBe(ResultStatus.Failure);
    expect(verify).not.toHaveBeenCalled();
  });

  it("Trust Profile 派生身份策略漂移时在 Manifest 签名验证前关闭失败", async () => {
    const fixture = await createVerificationFixture({
      additionalCertificateExtensions: [{ oid: "1.2.3.4", value: "profile-only" }],
    });
    const verify = verifierReturning(fixture.signerIdentity);
    const result = await new VerifyExecutorCompatibilityReleaseManifestUseCase(
      { verify },
      fixture.digest,
    ).execute(fixture.input);

    expect(result.status).toBe(ResultStatus.Failure);
    expect(verify).not.toHaveBeenCalled();
  });

  it("Manifest 证书实际身份漂移时阻止 P3b 验证", async () => {
    const fixture = await createVerificationFixture();
    const verify = verifierReturning({
      ...fixture.signerIdentity,
      certificateIdentity: "https://example.invalid/forged",
    });
    const result = await new VerifyExecutorCompatibilityReleaseManifestUseCase(
      { verify },
      fixture.digest,
    ).execute(fixture.input);

    expect(result.status).toBe(ResultStatus.Failure);
    expect(verify).toHaveBeenCalledOnce();
  });

  it("P3b Artifact 被拼接或摘要漂移时阻止第二次签名验证", async () => {
    const fixture = await createVerificationFixture();
    const verify = verifierReturning(fixture.signerIdentity);
    const result = await new VerifyExecutorCompatibilityReleaseManifestUseCase(
      { verify },
      fixture.digest,
    ).execute({
      ...fixture.input,
      releaseAttestationArtifact: {
        ...fixture.releaseAttestationArtifact,
        sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub("spliced"),
      },
    });

    expect(result.status).toBe(ResultStatus.Failure);
    expect(verify).toHaveBeenCalledOnce();
  });

  it("Target 或最低 Support Level 不满足时在两次签名验证后关闭失败", async () => {
    const targetFixture = await createVerificationFixture({
      target: { ...baseTarget(), uri: "https://registry.npmjs.org/other-package" },
    });
    const targetVerify = verifierReturning(targetFixture.signerIdentity);
    const targetResult = await new VerifyExecutorCompatibilityReleaseManifestUseCase(
      { verify: targetVerify },
      targetFixture.digest,
    ).execute(targetFixture.input);
    expect(targetResult.status).toBe(ResultStatus.Failure);
    expect(targetVerify).toHaveBeenCalledTimes(2);

    const supportFixture = await createVerificationFixture({
      minimumSupportLevel: ExecutorSupportLevel.Production,
    });
    expect(supportFixture.manifest.supportLevel).not.toBe(ExecutorSupportLevel.Production);
    const supportVerify = verifierReturning(supportFixture.signerIdentity);
    const supportResult = await new VerifyExecutorCompatibilityReleaseManifestUseCase(
      { verify: supportVerify },
      supportFixture.digest,
    ).execute(supportFixture.input);
    expect(supportResult.status).toBe(ResultStatus.Failure);
    expect(supportVerify).toHaveBeenCalledTimes(2);
  });
});

async function createVerificationFixture(
  options: {
    readonly additionalCertificateExtensions?: readonly { oid: string; value: string }[];
    readonly minimumSupportLevel?: ExecutorSupportLevel;
    readonly target?: ReturnType<typeof baseTarget>;
  } = {},
) {
  const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
  const trustedRoot = createExecutorCompatibilityTrustedRootStub();
  const releaseAttestationArtifact = createSignedAttestationArtifactForFixture(
    fixture,
    createExecutorCompatibilitySigstoreBundleStub("release"),
  );
  const manifest = createManifest(fixture, releaseAttestationArtifact.artifactDigest, {
    statementDigest: releaseAttestationArtifact.statementDigest,
    sigstoreBundleDigest: releaseAttestationArtifact.sigstoreBundleDigest,
  });
  const manifestDecisionRequest = withManifestDecisionRequestDigest(
    { ...fixture.manifestDecisionRequest, artifactDigest: manifest.manifestDigest },
    fixture,
  );
  const manifestApprovalRecord = withManifestApprovalRecordDigest(
    {
      ...fixture.manifestApprovalRecord,
      decisionRequestId: manifestDecisionRequest.decisionRequestId,
      decisionRequestDigest: manifestDecisionRequest.digest,
      artifactDigest: manifest.manifestDigest,
    },
    fixture,
  );
  const manifestDraft = createExecutorCompatibilityReleaseManifestAttestationDraft(
    {
      manifest,
      publisherIdentityPolicy: fixture.publisherIdentityPolicy,
      decisionRequest: manifestDecisionRequest,
      approvalRecord: manifestApprovalRecord,
    },
    fixture.digest,
  );
  if (manifestDraft.status === ResultStatus.Failure) throw manifestDraft.error;
  const manifestArtifact = createExecutorCompatibilitySignedReleaseManifestArtifact(
    {
      draft: manifestDraft.value,
      sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub("manifest"),
    },
    fixture.digest,
  );
  if (manifestArtifact.status === ResultStatus.Failure) throw manifestArtifact.error;
  const trustProfile = createTrustProfile(fixture, trustedRoot, options);
  const signerIdentity = createVerifiedSignerIdentityStub(fixture);
  return {
    ...fixture,
    manifest,
    manifestArtifact: manifestArtifact.value,
    releaseAttestationArtifact,
    trustProfile,
    trustedRoot,
    trustedRootDigest: digest(fixture, trustedRoot),
    derivedPolicy: fixture.publisherIdentityPolicy,
    signerIdentity,
    input: {
      manifestArtifact: manifestArtifact.value,
      expectedManifestDigest: manifest.manifestDigest,
      releaseAttestationArtifact,
      trustProfile,
      trustedRoot,
    },
  };
}

function createManifest(
  fixture: ExecutorCompatibilityReleaseManifestAttestationFixture,
  artifactDigest: ContentDigest,
  verifiedAttestation: {
    readonly statementDigest: ContentDigest;
    readonly sigstoreBundleDigest: ContentDigest;
  },
): ExecutorCompatibilityReleaseManifest {
  const [packageTarball, publicationBundle, signedReleaseAttestation] = fixture.manifest.artifacts;
  if (
    packageTarball === undefined ||
    publicationBundle === undefined ||
    signedReleaseAttestation === undefined
  ) {
    throw new Error("Release Manifest Fixture 缺少固定 Artifact。");
  }
  const manifest = createExecutorCompatibilityReleaseManifest(
    {
      draft: createStrictExecutorCompatibilityAttestationDraft(fixture),
      packageTarball,
      publicationBundle,
      signedReleaseAttestation: { ...signedReleaseAttestation, digest: artifactDigest },
      verifiedAttestation: { artifactDigest, ...verifiedAttestation },
    },
    fixture.digest,
  );
  if (manifest.status === ResultStatus.Failure) throw manifest.error;
  return manifest.value;
}

function createTrustProfile(
  fixture: ExecutorCompatibilityReleaseManifestAttestationFixture,
  trustedRoot: unknown,
  options: {
    readonly additionalCertificateExtensions?: readonly { oid: string; value: string }[];
    readonly minimumSupportLevel?: ExecutorSupportLevel;
    readonly target?: ReturnType<typeof baseTarget>;
  },
) {
  const runnerEnvironment = fixture.publisherIdentityPolicy.certificateExtensions.find(
    (extension) => extension.oid === SIGSTORE_RUNNER_ENVIRONMENT_OID,
  );
  if (runnerEnvironment === undefined) throw new Error("Fixture 缺少 Runner Environment 扩展。");
  const publisherTrustPolicy = createExecutorCompatibilityPublisherTrustPolicy(
    {
      certificateIssuer: fixture.publisherIdentityPolicy.certificateIssuer,
      certificateIdentity: fixture.publisherIdentityPolicy.certificateIdentity,
      runnerEnvironment: runnerEnvironment.value,
      ctLogThreshold: fixture.publisherIdentityPolicy.ctLogThreshold,
      tlogThreshold: fixture.publisherIdentityPolicy.tlogThreshold,
      additionalCertificateExtensions: options.additionalCertificateExtensions ?? [],
    },
    fixture.digest,
  );
  if (publisherTrustPolicy.status === ResultStatus.Failure) throw publisherTrustPolicy.error;
  const profile = createExecutorCompatibilityReleaseTrustProfile(
    {
      profileId: "liushi-harness-release",
      packageName: fixture.releaseSubject.packageName,
      repositoryUri: fixture.releaseSubject.repositoryUri,
      target: options.target ?? fixture.target,
      publisherTrustPolicy: publisherTrustPolicy.value,
      trustedRootDigest: digest(fixture, trustedRoot),
      minimumSupportLevel: options.minimumSupportLevel ?? ExecutorSupportLevel.Compatible,
      bootstrapManifestDigest: digest(fixture, { bootstrap: true }),
    },
    fixture.digest,
  );
  if (profile.status === ResultStatus.Failure) throw profile.error;
  return profile.value;
}

function verifierReturning(signerIdentity: ReturnType<typeof createVerifiedSignerIdentityStub>) {
  return vi.fn<ExecutorCompatibilityAttestationVerifierPort["verify"]>(() =>
    Promise.resolve(success({ signerIdentity })),
  );
}

function digest(fixture: ExecutorCompatibilityReleaseManifestAttestationFixture, input: unknown) {
  const result = fixture.digest.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function baseTarget() {
  return {
    kind: ExecutorCompatibilityPublicationTargetKind.NpmRegistry,
    uri: "https://registry.npmjs.org/liushi-harness",
  };
}
