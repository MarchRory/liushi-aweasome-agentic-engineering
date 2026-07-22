import { afterEach, describe, expect, it } from "vitest";

import { SignExecutorCompatibilityReleaseAttestationUseCase } from "../../src/application/useCases/signExecutorCompatibilityReleaseAttestation/index.js";
import { SignExecutorCompatibilityReleaseManifestUseCase } from "../../src/application/useCases/signExecutorCompatibilityReleaseManifest/index.js";
import { VerifyExecutorCompatibilityReleaseAttestationUseCase } from "../../src/application/useCases/verifyExecutorCompatibilityReleaseAttestation/index.js";
import { VerifyExecutorCompatibilityReleaseManifestUseCase } from "../../src/application/useCases/verifyExecutorCompatibilityReleaseManifest/index.js";
import type {
  ExecutorCompatibilityAttestationVerificationReceipt,
  ExecutorCompatibilitySignedAttestationArtifact,
  ExecutorCompatibilityTrustedRootJson,
} from "../../src/application/executorCompatibilityAttestation/contracts/index.js";
import { ResultStatus, type ContentDigest } from "../../src/common/index.js";
import { SIGSTORE_RUNNER_ENVIRONMENT_OID } from "../../src/domain/executorCompatibilityAttestation/index.js";
import {
  ExecutorCompatibilityReleaseArtifactKind,
  createExecutorCompatibilityReleaseManifest,
  type ExecutorCompatibilityReleaseManifest,
} from "../../src/domain/executorCompatibilityReleaseManifest/index.js";
import { ExecutorCompatibilityReleaseApprovalSubject } from "../../src/domain/executorCompatibilityAttestation/index.js";
import { createExecutorCompatibilityReleaseManifestAttestationDraft } from "../../src/domain/executorCompatibilityReleaseManifestAttestation/index.js";
import {
  createExecutorCompatibilityPublisherTrustPolicy,
  createExecutorCompatibilityReleaseTrustProfile,
} from "../../src/domain/executorCompatibilityReleaseTrust/index.js";
import {
  SigstoreExecutorCompatibilityAttestationSignerAdapter,
  SigstoreExecutorCompatibilityAttestationVerifierAdapter,
} from "../../src/infrastructure/index.js";
import {
  SigstoreAttestationTestMode,
  createExecutorCompatibilityReleaseManifestAttestationFixture,
  createSigstoreAttestationTestEnvironment,
  createStrictExecutorCompatibilityAttestationDraft,
  withManifestApprovalRecordDigest,
  withManifestDecisionRequestDigest,
  type ExecutorCompatibilityReleaseManifestAttestationFixture,
  type SigstoreAttestationTestEnvironment,
  createExecutorCompatibilityTrustedApprovalAuthority,
} from "../support/executorCompatibility/index.js";

let activeEnvironment: SigstoreAttestationTestEnvironment | undefined;

afterEach(() => {
  activeEnvironment?.restore();
  activeEnvironment = undefined;
});

describe("Sigstore Executor Compatibility Release Manifest", () => {
  it.each([SigstoreAttestationTestMode.DefaultRekorV1, SigstoreAttestationTestMode.RekorV2WithTsa])(
    "连续签名 P3b 与 Manifest 后在完全禁网状态验证完整发布链：%s",
    async (mode) => {
      const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
      const environment = await createSigstoreAttestationTestEnvironment(fixture, mode, 2);
      activeEnvironment = environment;
      const signer = new SigstoreExecutorCompatibilityAttestationSignerAdapter(
        environment.attestClient,
      );
      const verifier = new SigstoreExecutorCompatibilityAttestationVerifierAdapter();
      const releaseSigning = new SignExecutorCompatibilityReleaseAttestationUseCase(
        signer,
        createExecutorCompatibilityTrustedApprovalAuthority(
          [
            {
              approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
              artifactDigest: fixture.releaseCandidate.candidateDigest,
              decisionRequest: fixture.decisionRequest,
              approvalRecord: fixture.approvalRecord,
            },
          ],
          fixture.digest,
        ),
        fixture.digest,
      );
      const releaseVerification = new VerifyExecutorCompatibilityReleaseAttestationUseCase(
        verifier,
        fixture.digest,
      );

      const signedRelease = await releaseSigning.execute({
        draft: createStrictExecutorCompatibilityAttestationDraft(fixture),
      });
      if (signedRelease.status === ResultStatus.Failure) throw signedRelease.error;
      const verifiedRelease = await releaseVerification.execute({
        artifact: signedRelease.value,
        trustedRoot: environment.trustedRoot,
      });
      if (verifiedRelease.status === ResultStatus.Failure) throw verifiedRelease.error;

      const manifest = createManifest(fixture, signedRelease.value, verifiedRelease.value);
      const manifestDraft = createManifestDraft(fixture, manifest);
      const signedManifest = await new SignExecutorCompatibilityReleaseManifestUseCase(
        signer,
        createExecutorCompatibilityTrustedApprovalAuthority(
          [
            {
              approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
              artifactDigest: manifest.manifestDigest,
              decisionRequest: manifestDraft.decisionRequest,
              approvalRecord: manifestDraft.approvalRecord,
            },
          ],
          fixture.digest,
        ),
        fixture.digest,
      ).execute({ draft: manifestDraft });
      if (signedManifest.status === ResultStatus.Failure) throw signedManifest.error;
      const trustProfile = createTrustProfile(fixture, environment.trustedRoot, manifest);

      environment.disconnectSigningServices();
      const verifiedManifest = await new VerifyExecutorCompatibilityReleaseManifestUseCase(
        verifier,
        fixture.digest,
      ).execute({
        manifestArtifact: signedManifest.value,
        expectedManifestDigest: manifest.manifestDigest,
        releaseAttestationArtifact: signedRelease.value,
        trustProfile,
        trustedRoot: environment.trustedRoot,
      });

      if (verifiedManifest.status === ResultStatus.Failure) throw verifiedManifest.error;
      expect(verifiedManifest.value).toMatchObject({
        manifestArtifactDigest: signedManifest.value.artifactDigest,
        manifestDigest: manifest.manifestDigest,
        releaseAttestationArtifactDigest: signedRelease.value.artifactDigest,
        releaseCandidateDigest: fixture.releaseCandidate.candidateDigest,
        publisherIdentityPolicyDigest: fixture.publisherIdentityPolicy.identityPolicyDigest,
        profileDigest: trustProfile.profileDigest,
      });
    },
  );
});

function createManifest(
  fixture: ExecutorCompatibilityReleaseManifestAttestationFixture,
  signedRelease: ExecutorCompatibilitySignedAttestationArtifact,
  verifiedRelease: ExecutorCompatibilityAttestationVerificationReceipt,
): ExecutorCompatibilityReleaseManifest {
  const [packageTarball, publicationBundle, signedReleaseAttestation] = fixture.manifest.artifacts;
  if (
    packageTarball?.kind !== ExecutorCompatibilityReleaseArtifactKind.PackageTarball ||
    publicationBundle?.kind !== ExecutorCompatibilityReleaseArtifactKind.PublicationBundle ||
    signedReleaseAttestation?.kind !==
      ExecutorCompatibilityReleaseArtifactKind.SignedReleaseAttestation
  ) {
    throw new Error("Release Manifest Fixture 的 Artifact 顺序非法。");
  }
  const result = createExecutorCompatibilityReleaseManifest(
    {
      draft: createStrictExecutorCompatibilityAttestationDraft(fixture),
      packageTarball,
      publicationBundle,
      signedReleaseAttestation: {
        ...signedReleaseAttestation,
        digest: signedRelease.artifactDigest,
      },
      verifiedAttestation: {
        artifactDigest: verifiedRelease.artifactDigest,
        statementDigest: verifiedRelease.statementDigest,
        sigstoreBundleDigest: verifiedRelease.sigstoreBundleDigest,
      },
    },
    fixture.digest,
  );
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function createManifestDraft(
  fixture: ExecutorCompatibilityReleaseManifestAttestationFixture,
  manifest: ExecutorCompatibilityReleaseManifest,
) {
  const decisionRequest = withManifestDecisionRequestDigest(
    { ...fixture.manifestDecisionRequest, artifactDigest: manifest.manifestDigest },
    fixture,
  );
  const approvalRecord = withManifestApprovalRecordDigest(
    {
      ...fixture.manifestApprovalRecord,
      decisionRequestId: decisionRequest.decisionRequestId,
      decisionRequestDigest: decisionRequest.digest,
      artifactDigest: manifest.manifestDigest,
    },
    fixture,
  );
  const result = createExecutorCompatibilityReleaseManifestAttestationDraft(
    {
      manifest,
      publisherIdentityPolicy: fixture.publisherIdentityPolicy,
      decisionRequest,
      approvalRecord,
    },
    fixture.digest,
  );
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function createTrustProfile(
  fixture: ExecutorCompatibilityReleaseManifestAttestationFixture,
  trustedRoot: ExecutorCompatibilityTrustedRootJson,
  manifest: ExecutorCompatibilityReleaseManifest,
) {
  const runnerEnvironment = fixture.publisherIdentityPolicy.certificateExtensions.find(
    (extension) => extension.oid === SIGSTORE_RUNNER_ENVIRONMENT_OID,
  );
  if (runnerEnvironment === undefined) throw new Error("Fixture 缺少 Runner Environment 扩展。");
  const trustPolicy = createExecutorCompatibilityPublisherTrustPolicy(
    {
      certificateIssuer: fixture.publisherIdentityPolicy.certificateIssuer,
      certificateIdentity: fixture.publisherIdentityPolicy.certificateIdentity,
      runnerEnvironment: runnerEnvironment.value,
      ctLogThreshold: fixture.publisherIdentityPolicy.ctLogThreshold,
      tlogThreshold: fixture.publisherIdentityPolicy.tlogThreshold,
      additionalCertificateExtensions: [],
    },
    fixture.digest,
  );
  if (trustPolicy.status === ResultStatus.Failure) throw trustPolicy.error;
  const profile = createExecutorCompatibilityReleaseTrustProfile(
    {
      profileId: "liushi-harness-release",
      packageName: manifest.releaseSubject.packageName,
      repositoryUri: manifest.releaseSubject.repositoryUri,
      target: manifest.target,
      publisherTrustPolicy: trustPolicy.value,
      trustedRootDigest: digest(fixture, trustedRoot),
      minimumSupportLevel: manifest.supportLevel,
      bootstrapManifestDigest: manifest.manifestDigest,
    },
    fixture.digest,
  );
  if (profile.status === ResultStatus.Failure) throw profile.error;
  return profile.value;
}

function digest(
  fixture: ExecutorCompatibilityReleaseManifestAttestationFixture,
  input: unknown,
): ContentDigest {
  const result = fixture.digest.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
