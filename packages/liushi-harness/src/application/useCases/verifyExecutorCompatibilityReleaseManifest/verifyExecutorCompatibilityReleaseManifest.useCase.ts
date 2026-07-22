import {
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_VERIFICATION_RECEIPT_SCHEMA_VERSION,
  validateExecutorCompatibilitySignedReleaseManifestArtifact,
  type ExecutorCompatibilityReleaseManifestVerificationReceipt,
} from "#application/executorCompatibilityReleaseManifestAttestation/index.js";
import {
  requireExactExecutorCompatibilitySignerIdentity,
  validateExecutorCompatibilitySignedAttestationArtifact,
  validateExecutorCompatibilityTrustedRootJson,
} from "#application/executorCompatibilityAttestation/index.js";
import type {
  ContentDigestPort,
  ExecutorCompatibilityAttestationVerifierPort,
} from "#application/ports/index.js";
import { VerifyExecutorCompatibilityReleaseAttestationUseCase } from "#application/useCases/verifyExecutorCompatibilityReleaseAttestation/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  isExecutorCompatibilitySupportLevelAtLeast,
  deriveExecutorCompatibilityPublisherIdentityPolicy,
  validateExecutorCompatibilityReleaseTrustProfile,
} from "#domain/executorCompatibilityReleaseTrust/index.js";
import { validateExecutorCompatibilityReleaseManifest } from "#domain/executorCompatibilityReleaseManifest/index.js";

/** 离线复验签名 Release Manifest 所需的显式输入。 */
export interface VerifyExecutorCompatibilityReleaseManifestUseCaseInput {
  /** 可能来自文件或远端索引的 Signed Manifest Artifact。 */
  readonly manifestArtifact: unknown;
  /** 消费者通道钉住的精确 Manifest 摘要。 */
  readonly expectedManifestDigest: ContentDigest;
  /** 与 Manifest 绑定的 P3b Signed Release Attestation Artifact。 */
  readonly releaseAttestationArtifact: unknown;
  /** 消费者本地配置并完整校验的 Trust Profile。 */
  readonly trustProfile: unknown;
  /** 消费者可信通道提供的 Trusted Root JSON。 */
  readonly trustedRoot: unknown;
}

/** 使用消费者 Trust Profile 完整离线复验 P4b3 Release Manifest。 */
export class VerifyExecutorCompatibilityReleaseManifestUseCase {
  public constructor(
    private readonly verifier: ExecutorCompatibilityAttestationVerifierPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 任一摘要、信任根、身份、P3b 绑定或发布约束不匹配都会关闭式拒绝。 */
  public async execute(
    input: VerifyExecutorCompatibilityReleaseManifestUseCaseInput,
  ): Promise<Result<ExecutorCompatibilityReleaseManifestVerificationReceipt, HarnessErrorType>> {
    const profile = validateExecutorCompatibilityReleaseTrustProfile(
      input.trustProfile,
      this.digest,
    );
    if (profile.status === ResultStatus.Failure) return profile;

    const trustedRoot = validateExecutorCompatibilityTrustedRootJson(
      input.trustedRoot,
      this.digest,
    );
    if (trustedRoot.status === ResultStatus.Failure) return trustedRoot;
    if (trustedRoot.value.digest !== profile.value.trustedRootDigest) {
      return invalid("Trusted Root 摘要与 Trust Profile 不一致。");
    }

    const manifestArtifact = validateExecutorCompatibilitySignedReleaseManifestArtifact(
      input.manifestArtifact,
      this.digest,
    );
    if (manifestArtifact.status === ResultStatus.Failure) return manifestArtifact;
    if (input.expectedManifestDigest !== manifestArtifact.value.draft.manifest.manifestDigest) {
      return invalid("外部 Manifest 摘要与 Signed Manifest 不一致。");
    }

    const derivedPolicy = deriveExecutorCompatibilityPublisherIdentityPolicy(
      {
        profile: profile.value,
        releaseSubject: manifestArtifact.value.draft.manifest.releaseSubject,
      },
      this.digest,
    );
    if (derivedPolicy.status === ResultStatus.Failure) return derivedPolicy;
    const manifestPolicyMatches = this.sameCanonical(
      manifestArtifact.value.draft.publisherIdentityPolicy,
      derivedPolicy.value,
    );
    if (manifestPolicyMatches.status === ResultStatus.Failure) return manifestPolicyMatches;
    if (!manifestPolicyMatches.value) {
      return invalid("Signed Manifest Identity Policy 与 Trust Profile 派生策略不一致。");
    }

    const manifestCryptographic = await this.verifier.verify({
      sigstoreBundle: manifestArtifact.value.sigstoreBundle,
      trustedRoot: trustedRoot.value.trustedRoot,
      statement: manifestArtifact.value.draft.statement,
      publisherIdentityPolicy: derivedPolicy.value,
    });
    if (manifestCryptographic.status === ResultStatus.Failure) return manifestCryptographic;
    const manifestSignerIdentity = requireExactExecutorCompatibilitySignerIdentity(
      manifestCryptographic.value.signerIdentity,
      derivedPolicy.value,
    );
    if (manifestSignerIdentity.status === ResultStatus.Failure) return manifestSignerIdentity;

    const releaseAttestationArtifact = validateExecutorCompatibilitySignedAttestationArtifact(
      input.releaseAttestationArtifact,
      this.digest,
    );
    if (releaseAttestationArtifact.status === ResultStatus.Failure)
      return releaseAttestationArtifact;
    const releasePolicyMatches = this.sameCanonical(
      releaseAttestationArtifact.value.draft.publisherIdentityPolicy,
      derivedPolicy.value,
    );
    if (releasePolicyMatches.status === ResultStatus.Failure) return releasePolicyMatches;
    if (!releasePolicyMatches.value) {
      return invalid("P3b Identity Policy 与 Trust Profile 派生策略不一致。");
    }

    const releaseAttestation = await new VerifyExecutorCompatibilityReleaseAttestationUseCase(
      this.verifier,
      this.digest,
    ).execute({
      artifact: releaseAttestationArtifact.value,
      trustedRoot: trustedRoot.value.trustedRoot,
    });
    if (releaseAttestation.status === ResultStatus.Failure) return releaseAttestation;

    const manifest = validateExecutorCompatibilityReleaseManifest(
      manifestArtifact.value.draft.manifest,
      releaseAttestationArtifact.value.draft,
      {
        artifactDigest: releaseAttestation.value.artifactDigest,
        statementDigest: releaseAttestation.value.statementDigest,
        sigstoreBundleDigest: releaseAttestation.value.sigstoreBundleDigest,
      },
      this.digest,
    );
    if (manifest.status === ResultStatus.Failure) return manifest;
    const targetMatches = this.sameCanonical(profile.value.target, manifest.value.target);
    if (targetMatches.status === ResultStatus.Failure) return targetMatches;
    if (!targetMatches.value) return invalid("Release Manifest Target 与 Trust Profile 不一致。");
    if (
      !isExecutorCompatibilitySupportLevelAtLeast(
        manifest.value.supportLevel,
        profile.value.minimumSupportLevel,
      )
    ) {
      return invalid("Release Manifest Support Level 未达到 Trust Profile 最低要求。");
    }

    return success({
      schemaVersion: EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_VERIFICATION_RECEIPT_SCHEMA_VERSION,
      manifestArtifactDigest: manifestArtifact.value.artifactDigest,
      manifestStatementDigest: manifestArtifact.value.statementDigest,
      manifestSigstoreBundleDigest: manifestArtifact.value.sigstoreBundleDigest,
      manifestDigest: manifest.value.manifestDigest,
      releaseAttestationArtifactDigest: releaseAttestation.value.artifactDigest,
      releaseAttestationStatementDigest: releaseAttestation.value.statementDigest,
      releaseAttestationSigstoreBundleDigest: releaseAttestation.value.sigstoreBundleDigest,
      releaseCandidateDigest: releaseAttestation.value.releaseCandidateDigest,
      publisherIdentityPolicyDigest: derivedPolicy.value.identityPolicyDigest,
      profileDigest: profile.value.profileDigest,
      trustedRootDigest: trustedRoot.value.digest,
      signerIdentity: manifestSignerIdentity.value,
    });
  }

  /** 用规范摘要比较两个 JSON-compatible 值，避免依赖对象引用或字段顺序。 */
  private sameCanonical(left: unknown, right: unknown): Result<boolean, HarnessErrorType> {
    const leftDigest = this.digest.calculate(left);
    if (leftDigest.status === ResultStatus.Failure) return leftDigest;
    const rightDigest = this.digest.calculate(right);
    if (rightDigest.status === ResultStatus.Failure) return rightDigest;
    return success(leftDigest.value === rightDigest.value);
  }
}

function invalid(message: string): Result<never, HarnessErrorType> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
