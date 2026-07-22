import type { Signer, VerificationPolicy } from "@sigstore/verify";

import type { ExecutorCompatibilityVerifiedSignerIdentity } from "#application/executorCompatibilityAttestation/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";
import type { ExecutorCompatibilityPublisherIdentityPolicy } from "#domain/executorCompatibilityAttestation/index.js";

import { decodeSigstoreCertificateExtensionValue } from "./sigstoreCertificateExtension.js";

/** 将 SAN 与 Issuer 转为官方 Verifier 策略；自定义 OID 由本模块独立解码复验。 */
export function createSigstorePublisherVerificationPolicy(
  policy: ExecutorCompatibilityPublisherIdentityPolicy,
): VerificationPolicy {
  return {
    subjectAlternativeName: `^${escapeRegularExpression(policy.certificateIdentity.value)}$`,
    extensions: { issuer: policy.certificateIssuer },
  };
}

/** 从已验证证书恢复实际身份，并再次执行精确字节比较。 */
export function extractVerifiedSigstorePublisherIdentity(
  signer: Signer,
  policy: ExecutorCompatibilityPublisherIdentityPolicy,
): Result<ExecutorCompatibilityVerifiedSignerIdentity, HarnessError> {
  const identity = signer.identity;
  if (
    identity?.extensions?.issuer !== policy.certificateIssuer ||
    identity.subjectAlternativeName !== policy.certificateIdentity.value
  ) {
    return identityFailure("Sigstore 证书 Issuer 或 SAN 与策略不一致。");
  }
  const certificateExtensions = [];
  for (const expected of policy.certificateExtensions) {
    const matches =
      identity.oids?.filter((actual) => actual.oid?.id.join(".") === expected.oid) ?? [];
    if (matches.length !== 1) {
      return identityFailure("Sigstore 证书扩展缺失、重复或值不匹配。");
    }
    const [match] = matches;
    if (match === undefined) {
      return identityFailure("Sigstore 证书扩展缺失、重复或值不匹配。");
    }
    const decoded = decodeSigstoreCertificateExtensionValue(match.value);
    if (decoded.status === ResultStatus.Failure) return decoded;
    if (decoded.value !== expected.value) {
      return identityFailure("Sigstore 证书扩展缺失、重复或值不匹配。");
    }
    certificateExtensions.push({
      oid: expected.oid,
      value: decoded.value,
    });
  }
  return success({
    certificateIssuer: identity.extensions.issuer,
    certificateIdentity: identity.subjectAlternativeName,
    certificateExtensions,
  });
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function identityFailure(message: string): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed, message),
  );
}
