import type {
  ExecutorCompatibilityPublisherTrustPolicy,
  ExecutorCompatibilityPublisherTrustPolicyDigestInput,
  ExecutorCompatibilityReleaseTrustProfile,
  ExecutorCompatibilityReleaseTrustProfileDigestInput,
} from "../contracts/index.js";

/** 创建排除 Publisher Trust Policy 摘要自身后的规范输入。 */
export function createExecutorCompatibilityPublisherTrustPolicyDigestInput(
  policy:
    | ExecutorCompatibilityPublisherTrustPolicy
    | ExecutorCompatibilityPublisherTrustPolicyDigestInput,
): ExecutorCompatibilityPublisherTrustPolicyDigestInput {
  return {
    schemaVersion: policy.schemaVersion,
    certificateIssuer: policy.certificateIssuer,
    certificateIdentity: { ...policy.certificateIdentity },
    runnerEnvironment: policy.runnerEnvironment,
    ctLogThreshold: policy.ctLogThreshold,
    tlogThreshold: policy.tlogThreshold,
    additionalCertificateExtensions: [...policy.additionalCertificateExtensions]
      .map((extension) => ({ ...extension }))
      .sort((left, right) => compare(left.oid, right.oid)),
  };
}

/** 对额外证书扩展按 OID 执行稳定排序。 */
export function normalizeExecutorCompatibilityPublisherTrustPolicyExtensions(
  extensions: readonly { oid: string; value: string }[],
): readonly { oid: string; value: string }[] {
  return [...extensions]
    .map((extension) => ({ ...extension }))
    .sort((left, right) => compare(left.oid, right.oid));
}

/** 创建排除 Trust Profile 摘要自身后的规范输入。 */
export function createExecutorCompatibilityReleaseTrustProfileDigestInput(
  profile:
    ExecutorCompatibilityReleaseTrustProfile | ExecutorCompatibilityReleaseTrustProfileDigestInput,
): ExecutorCompatibilityReleaseTrustProfileDigestInput {
  return {
    schemaVersion: profile.schemaVersion,
    profileId: profile.profileId,
    packageName: profile.packageName,
    repositoryUri: profile.repositoryUri,
    target: { ...profile.target },
    publisherTrustPolicy: {
      ...profile.publisherTrustPolicy,
      certificateIdentity: { ...profile.publisherTrustPolicy.certificateIdentity },
      additionalCertificateExtensions: normalizeExecutorCompatibilityPublisherTrustPolicyExtensions(
        profile.publisherTrustPolicy.additionalCertificateExtensions,
      ),
    },
    trustedRootDigest: profile.trustedRootDigest,
    minimumSupportLevel: profile.minimumSupportLevel,
    bootstrapManifestDigest: profile.bootstrapManifestDigest,
  };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
