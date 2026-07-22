import { ResultStatus, type HarnessError, type Result } from "#common/index.js";

import {
  EXECUTOR_COMPATIBILITY_PUBLISHER_TRUST_POLICY_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_SCHEMA_VERSION,
} from "../constants/index.js";
import type {
  CreateExecutorCompatibilityPublisherTrustPolicyInput,
  CreateExecutorCompatibilityReleaseTrustProfileInput,
  ExecutorCompatibilityPublisherTrustPolicy,
  ExecutorCompatibilityReleaseTrustProfile,
  ExecutorCompatibilityReleaseTrustProfileDigestInput,
  ExecutorCompatibilityReleaseTrustDigestPort,
} from "../contracts/index.js";
import {
  createExecutorCompatibilityPublisherTrustPolicyDigestInput,
  createExecutorCompatibilityReleaseTrustProfileDigestInput,
  normalizeExecutorCompatibilityPublisherTrustPolicyExtensions,
} from "../digest/index.js";
import {
  validateExecutorCompatibilityPublisherTrustPolicy,
  validateExecutorCompatibilityPublisherTrustPolicyDigestInput,
  validateExecutorCompatibilityReleaseTrustProfile,
  validateExecutorCompatibilityReleaseTrustProfileDigestInput,
} from "../validation/index.js";

/** 从稳定身份约束创建确定性的 Publisher Trust Policy。 */
export function createExecutorCompatibilityPublisherTrustPolicy(
  input: CreateExecutorCompatibilityPublisherTrustPolicyInput,
  digestPort: ExecutorCompatibilityReleaseTrustDigestPort,
): Result<ExecutorCompatibilityPublisherTrustPolicy, HarnessError> {
  const candidate = {
    schemaVersion: EXECUTOR_COMPATIBILITY_PUBLISHER_TRUST_POLICY_SCHEMA_VERSION,
    certificateIssuer: input.certificateIssuer,
    certificateIdentity: { ...input.certificateIdentity },
    runnerEnvironment: input.runnerEnvironment,
    ctLogThreshold: input.ctLogThreshold,
    tlogThreshold: input.tlogThreshold,
    additionalCertificateExtensions: normalizeExecutorCompatibilityPublisherTrustPolicyExtensions(
      input.additionalCertificateExtensions,
    ),
  };
  const validated = validateExecutorCompatibilityPublisherTrustPolicyDigestInput(candidate);
  if (validated.status === ResultStatus.Failure) return validated;
  const digest = digestPort.calculate(
    createExecutorCompatibilityPublisherTrustPolicyDigestInput(validated.value),
  );
  if (digest.status === ResultStatus.Failure) return digest;
  return validateExecutorCompatibilityPublisherTrustPolicy(
    { ...validated.value, publisherTrustPolicyDigest: digest.value },
    digestPort,
  );
}

/** 从消费者锚点创建确定性的 Trust Profile。 */
export function createExecutorCompatibilityReleaseTrustProfile(
  input: CreateExecutorCompatibilityReleaseTrustProfileInput,
  digestPort: ExecutorCompatibilityReleaseTrustDigestPort,
): Result<ExecutorCompatibilityReleaseTrustProfile, HarnessError> {
  const candidate: ExecutorCompatibilityReleaseTrustProfileDigestInput = {
    schemaVersion: EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_SCHEMA_VERSION,
    profileId: input.profileId,
    packageName: input.packageName,
    repositoryUri: input.repositoryUri,
    target: { ...input.target },
    publisherTrustPolicy: {
      ...input.publisherTrustPolicy,
      certificateIdentity: { ...input.publisherTrustPolicy.certificateIdentity },
      additionalCertificateExtensions: [
        ...input.publisherTrustPolicy.additionalCertificateExtensions,
      ].map((extension) => ({ ...extension })),
    },
    trustedRootDigest: input.trustedRootDigest,
    minimumSupportLevel: input.minimumSupportLevel,
    bootstrapManifestDigest: input.bootstrapManifestDigest,
  };
  const validated = validateExecutorCompatibilityReleaseTrustProfileDigestInput(
    candidate,
    digestPort,
  );
  if (validated.status === ResultStatus.Failure) return validated;
  const digest = digestPort.calculate(
    createExecutorCompatibilityReleaseTrustProfileDigestInput(validated.value),
  );
  if (digest.status === ResultStatus.Failure) return digest;
  return validateExecutorCompatibilityReleaseTrustProfile(
    { ...validated.value, profileDigest: digest.value },
    digestPort,
  );
}
