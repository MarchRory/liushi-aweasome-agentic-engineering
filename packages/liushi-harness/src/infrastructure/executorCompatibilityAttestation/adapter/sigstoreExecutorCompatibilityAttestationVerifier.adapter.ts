import { TrustedRoot } from "@sigstore/protobuf-specs";
import { toSignedEntity, toTrustMaterial, Verifier } from "@sigstore/verify";

import {
  type ExecutorCompatibilityAttestationCryptographicVerificationResult,
  type ExecutorCompatibilityAttestationVerifierPort,
  type VerifyExecutorCompatibilityAttestationInput,
} from "#application/ports/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";
import { IN_TOTO_ATTESTATION_PAYLOAD_TYPE } from "#domain/executorCompatibilityAttestation/index.js";

import { SIGSTORE_TRUSTED_ROOT_V02_MEDIA_TYPE } from "../constants/index.js";
import {
  createSigstorePublisherVerificationPolicy,
  extractVerifiedSigstorePublisherIdentity,
} from "../identity/index.js";
import { serializeExecutorCompatibilityInTotoStatement } from "../serialization/index.js";
import { validateSigstoreAttestationBundle } from "../validation/index.js";

/** 使用显式 Trusted Root 且不触发 TUF 或网络的 Sigstore Verifier。 */
export class SigstoreExecutorCompatibilityAttestationVerifierAdapter implements ExecutorCompatibilityAttestationVerifierPort {
  /** 关闭式验证 DSSE、证书链、CT、TLog、时间证据、Issuer、SAN 与全部 OID。 */
  public verify(
    input: VerifyExecutorCompatibilityAttestationInput,
  ): Promise<
    Result<ExecutorCompatibilityAttestationCryptographicVerificationResult, HarnessError>
  > {
    return Promise.resolve(this.verifySynchronously(input));
  }

  private verifySynchronously(
    input: VerifyExecutorCompatibilityAttestationInput,
  ): Result<ExecutorCompatibilityAttestationCryptographicVerificationResult, HarnessError> {
    const payload = serializeExecutorCompatibilityInTotoStatement(input.statement);
    const validatedBundle = validateSigstoreAttestationBundle(
      input.sigstoreBundle,
      payload,
      IN_TOTO_ATTESTATION_PAYLOAD_TYPE,
      HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed,
    );
    if (validatedBundle.status === ResultStatus.Failure) return validatedBundle;
    try {
      const trustedRoot = TrustedRoot.fromJSON(input.trustedRoot);
      if (trustedRoot.mediaType !== SIGSTORE_TRUSTED_ROOT_V02_MEDIA_TYPE) {
        return verificationFailure("Sigstore Trusted Root 必须使用 v0.2 媒体类型。");
      }
      if (
        trustedRoot.certificateAuthorities.length === 0 ||
        trustedRoot.ctlogs.length < input.publisherIdentityPolicy.ctLogThreshold ||
        trustedRoot.tlogs.length < input.publisherIdentityPolicy.tlogThreshold
      ) {
        return verificationFailure(
          "Sigstore Trusted Root 的 CA、CT Log 或 TLog 不满足发布者策略阈值。",
        );
      }
      const verifier = new Verifier(toTrustMaterial(trustedRoot), {
        ctlogThreshold: input.publisherIdentityPolicy.ctLogThreshold,
        tlogThreshold: input.publisherIdentityPolicy.tlogThreshold,
        timestampThreshold: 1,
      });
      const signer = verifier.verify(
        toSignedEntity(validatedBundle.value.bundle),
        createSigstorePublisherVerificationPolicy(input.publisherIdentityPolicy),
      );
      const identity = extractVerifiedSigstorePublisherIdentity(
        signer,
        input.publisherIdentityPolicy,
      );
      return identity.status === ResultStatus.Failure
        ? identity
        : success({ signerIdentity: identity.value });
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed,
          "Sigstore Attestation 无法通过显式 Trusted Root 离线验证。",
          { causeName: error instanceof Error ? error.name : "UnknownError" },
          error,
        ),
      );
    }
  }
}

function verificationFailure(message: string): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed, message),
  );
}
