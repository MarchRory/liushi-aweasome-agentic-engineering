import {
  EXECUTOR_COMPATIBILITY_ATTESTATION_VERIFICATION_RECEIPT_SCHEMA_VERSION,
  validateExecutorCompatibilitySignedAttestationArtifact,
  validateExecutorCompatibilityTrustedRootJson,
  type ExecutorCompatibilityAttestationVerificationReceipt,
  type ExecutorCompatibilityVerifiedSignerIdentity,
} from "#application/executorCompatibilityAttestation/index.js";
import type {
  ContentDigestPort,
  ExecutorCompatibilityAttestationVerifierPort,
} from "#application/ports/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import type { ExecutorCompatibilityPublisherIdentityPolicy } from "#domain/executorCompatibilityAttestation/index.js";

/** 离线验证签名 Artifact 所需的显式输入。 */
export interface VerifyExecutorCompatibilityReleaseAttestationUseCaseInput {
  /** 可能来自文件或远端索引的待验证 Artifact。 */
  readonly artifact: unknown;
  /** 通过调用方受信通道提供的 Trusted Root JSON。 */
  readonly trustedRoot: unknown;
}

/** 先复验业务绑定，再调用纯离线密码学 Verifier 的 Application 操作。 */
export class VerifyExecutorCompatibilityReleaseAttestationUseCase {
  public constructor(
    private readonly verifier: ExecutorCompatibilityAttestationVerifierPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 任何业务摘要、DSSE、证书身份或信任根失败都会关闭式拒绝。 */
  public async execute(
    input: VerifyExecutorCompatibilityReleaseAttestationUseCaseInput,
  ): Promise<Result<ExecutorCompatibilityAttestationVerificationReceipt, HarnessErrorType>> {
    const artifact = validateExecutorCompatibilitySignedAttestationArtifact(
      input.artifact,
      this.digest,
    );
    if (artifact.status === ResultStatus.Failure) return artifact;
    const trustedRoot = validateExecutorCompatibilityTrustedRootJson(
      input.trustedRoot,
      this.digest,
    );
    if (trustedRoot.status === ResultStatus.Failure) return trustedRoot;
    const cryptographic = await this.verifier.verify({
      sigstoreBundle: artifact.value.sigstoreBundle,
      trustedRoot: trustedRoot.value.trustedRoot,
      statement: artifact.value.draft.statement,
      publisherIdentityPolicy: artifact.value.draft.publisherIdentityPolicy,
    });
    if (cryptographic.status === ResultStatus.Failure) return cryptographic;
    const identity = requireExactSignerIdentity(
      cryptographic.value.signerIdentity,
      artifact.value.draft.publisherIdentityPolicy,
    );
    if (identity.status === ResultStatus.Failure) return identity;
    return success({
      schemaVersion: EXECUTOR_COMPATIBILITY_ATTESTATION_VERIFICATION_RECEIPT_SCHEMA_VERSION,
      artifactDigest: artifact.value.artifactDigest,
      statementDigest: artifact.value.statementDigest,
      sigstoreBundleDigest: artifact.value.sigstoreBundleDigest,
      releaseCandidateDigest: artifact.value.draft.releaseCandidate.candidateDigest,
      trustedRootDigest: trustedRoot.value.digest,
      signerIdentity: identity.value,
    });
  }
}

function requireExactSignerIdentity(
  actual: ExecutorCompatibilityVerifiedSignerIdentity,
  policy: ExecutorCompatibilityPublisherIdentityPolicy,
): Result<ExecutorCompatibilityVerifiedSignerIdentity, HarnessErrorType> {
  const extensionsMatch =
    actual.certificateExtensions.length === policy.certificateExtensions.length &&
    policy.certificateExtensions.every(
      (expected) =>
        actual.certificateExtensions.filter(
          (candidate) => candidate.oid === expected.oid && candidate.value === expected.value,
        ).length === 1,
    );
  if (
    actual.certificateIssuer !== policy.certificateIssuer ||
    actual.certificateIdentity !== policy.certificateIdentity.value ||
    !extensionsMatch
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed,
        "Sigstore 证书身份与 Publisher Identity Policy 不一致。",
      ),
    );
  }
  return success(actual);
}
