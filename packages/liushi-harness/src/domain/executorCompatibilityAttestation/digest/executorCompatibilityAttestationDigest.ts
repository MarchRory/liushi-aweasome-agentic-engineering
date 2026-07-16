import type {
  ExecutorCompatibilityPublisherCertificateExtension,
  ExecutorCompatibilityPublisherIdentityPolicy,
  ExecutorCompatibilityPublisherIdentityPolicyDigestInput,
  ExecutorCompatibilityReleaseCandidate,
  ExecutorCompatibilityReleaseCandidateDigestInput,
} from "../contracts/index.js";

const SHA256_PREFIX_LENGTH = "sha256:".length;

/** 创建排除 Identity Policy Digest 自身后的稳定摘要输入。 */
export function createExecutorCompatibilityPublisherIdentityPolicyDigestInput(
  policy:
    | ExecutorCompatibilityPublisherIdentityPolicy
    | ExecutorCompatibilityPublisherIdentityPolicyDigestInput,
): ExecutorCompatibilityPublisherIdentityPolicyDigestInput {
  return {
    schemaVersion: policy.schemaVersion,
    certificateIssuer: policy.certificateIssuer,
    certificateIdentity: { ...policy.certificateIdentity },
    certificateExtensions: normalizeExecutorCompatibilityPublisherCertificateExtensions(
      policy.certificateExtensions,
    ),
    ctLogThreshold: policy.ctLogThreshold,
    tlogThreshold: policy.tlogThreshold,
  };
}

/** 创建排除 Release Candidate Digest 自身后的稳定摘要输入。 */
export function createExecutorCompatibilityReleaseCandidateDigestInput(
  candidate:
    ExecutorCompatibilityReleaseCandidate | ExecutorCompatibilityReleaseCandidateDigestInput,
): ExecutorCompatibilityReleaseCandidateDigestInput {
  return {
    schemaVersion: candidate.schemaVersion,
    bundleDigest: candidate.bundleDigest,
    matrixDigest: candidate.matrixDigest,
    packageDigest: candidate.packageDigest,
    publisherIdentityPolicyDigest: candidate.publisherIdentityPolicyDigest,
    target: { ...candidate.target },
  };
}

/** 按 OID 对发布者证书扩展执行稳定排序。 */
export function normalizeExecutorCompatibilityPublisherCertificateExtensions(
  extensions: readonly ExecutorCompatibilityPublisherCertificateExtension[],
): readonly ExecutorCompatibilityPublisherCertificateExtension[] {
  return [...extensions]
    .map((extension) => ({ ...extension }))
    .sort((left, right) => compare(left.oid, right.oid));
}

/** 将带算法前缀的 Content Digest 转换为 in-toto Subject 使用的十六进制值。 */
export function toExecutorCompatibilityInTotoSha256Hex(digest: string): string {
  return digest.slice(SHA256_PREFIX_LENGTH);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
