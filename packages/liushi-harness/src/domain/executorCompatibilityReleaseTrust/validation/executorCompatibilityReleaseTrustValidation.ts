import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import type { ZodError } from "zod";
import {
  EXECUTOR_COMPATIBILITY_PUBLISHER_IDENTITY_POLICY_SCHEMA_VERSION,
  type ExecutorCompatibilityPublisherIdentityPolicy,
  SIGSTORE_BUILD_SIGNER_URI_OID,
  SIGSTORE_CERTIFICATE_ISSUER_OID,
  SIGSTORE_RUNNER_ENVIRONMENT_OID,
  SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID,
  SIGSTORE_SOURCE_REPOSITORY_URI_OID,
  ExecutorCompatibilityCertificateIdentityKind,
  createExecutorCompatibilityPublisherIdentityPolicy,
} from "#domain/executorCompatibilityAttestation/index.js";
import { executorCompatibilityReleaseSubjectSchema } from "#domain/executorCompatibilityPublication/index.js";
import type {
  ExecutorCompatibilityPublisherTrustPolicy,
  ExecutorCompatibilityPublisherTrustPolicyDigestInput,
  ExecutorCompatibilityReleaseTrustProfile,
  ExecutorCompatibilityReleaseTrustProfileDigestInput,
  ExecutorCompatibilityReleaseTrustDigestPort,
  DeriveExecutorCompatibilityPublisherIdentityPolicyInput,
} from "../contracts/index.js";
import { createExecutorCompatibilityReleaseTrustProfileDigestInput } from "../digest/index.js";
import {
  executorCompatibilityPublisherTrustPolicyDigestInputSchema,
  executorCompatibilityPublisherTrustPolicySchema,
  executorCompatibilityReleaseTrustProfileDigestInputSchema,
  executorCompatibilityReleaseTrustProfileSchema,
} from "../schemas/index.js";

const RESERVED_CERTIFICATE_EXTENSION_OIDS = new Set([
  SIGSTORE_CERTIFICATE_ISSUER_OID,
  SIGSTORE_BUILD_SIGNER_URI_OID,
  SIGSTORE_RUNNER_ENVIRONMENT_OID,
  SIGSTORE_SOURCE_REPOSITORY_URI_OID,
  SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID,
]);

/** 校验不含自身摘要的 Publisher Trust Policy。 */
export function validateExecutorCompatibilityPublisherTrustPolicyDigestInput(
  input: unknown,
): Result<ExecutorCompatibilityPublisherTrustPolicyDigestInput, HarnessError> {
  const parsed = executorCompatibilityPublisherTrustPolicyDigestInputSchema.safeParse(input);
  if (!parsed.success) return invalidSchema("Publisher Trust Policy Schema 非法。", parsed.error);
  const extensions = parsed.data.additionalCertificateExtensions;
  const reserved = extensions.find((extension) =>
    RESERVED_CERTIFICATE_EXTENSION_OIDS.has(extension.oid),
  );
  if (reserved !== undefined) {
    return invalid("Publisher Trust Policy additionalCertificateExtensions 包含受管 OID。", {
      oid: reserved.oid,
    });
  }
  const duplicate = extensions.find(
    (extension, index) =>
      extensions.findIndex((candidate) => candidate.oid === extension.oid) !== index,
  );
  if (duplicate !== undefined) {
    return invalid("Publisher Trust Policy additionalCertificateExtensions 包含重复 OID。", {
      oid: duplicate.oid,
    });
  }
  if (!isSorted(extensions.map((extension) => extension.oid))) {
    return invalid("Publisher Trust Policy additionalCertificateExtensions 未按 OID 稳定排序。");
  }
  return success(parsed.data as ExecutorCompatibilityPublisherTrustPolicyDigestInput);
}

/** 校验完整 Publisher Trust Policy 的结构与自身摘要。 */
export function validateExecutorCompatibilityPublisherTrustPolicy(
  input: unknown,
  digestPort: ExecutorCompatibilityReleaseTrustDigestPort,
): Result<ExecutorCompatibilityPublisherTrustPolicy, HarnessError> {
  const parsed = executorCompatibilityPublisherTrustPolicySchema.safeParse(input);
  if (!parsed.success) return invalidSchema("Publisher Trust Policy Schema 非法。", parsed.error);
  const digestInput = {
    schemaVersion: parsed.data.schemaVersion,
    certificateIssuer: parsed.data.certificateIssuer,
    certificateIdentity: { ...parsed.data.certificateIdentity },
    runnerEnvironment: parsed.data.runnerEnvironment,
    ctLogThreshold: parsed.data.ctLogThreshold,
    tlogThreshold: parsed.data.tlogThreshold,
    additionalCertificateExtensions: parsed.data.additionalCertificateExtensions.map(
      (extension) => ({
        ...extension,
      }),
    ),
  };
  const validated = validateExecutorCompatibilityPublisherTrustPolicyDigestInput(digestInput);
  if (validated.status === ResultStatus.Failure) return validated;
  const digest = digestPort.calculate(validated.value);
  if (digest.status === ResultStatus.Failure) return digest;
  return digest.value === parsed.data.publisherTrustPolicyDigest
    ? success(parsed.data as ExecutorCompatibilityPublisherTrustPolicy)
    : invalid("Publisher Trust Policy 摘要漂移。", {
        expectedPublisherTrustPolicyDigest: digest.value,
        actualPublisherTrustPolicyDigest: parsed.data.publisherTrustPolicyDigest,
      });
}

/** 校验不含自身摘要的 Trust Profile 与嵌套稳定策略。 */
export function validateExecutorCompatibilityReleaseTrustProfileDigestInput(
  input: unknown,
  digestPort: ExecutorCompatibilityReleaseTrustDigestPort,
): Result<ExecutorCompatibilityReleaseTrustProfileDigestInput, HarnessError> {
  const parsed = executorCompatibilityReleaseTrustProfileDigestInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidSchema(
      "Executor Compatibility Release Trust Profile Schema 非法。",
      parsed.error,
    );
  }
  const policy = validateExecutorCompatibilityPublisherTrustPolicy(
    parsed.data.publisherTrustPolicy,
    digestPort,
  );
  if (policy.status === ResultStatus.Failure) return policy;
  return success(parsed.data as ExecutorCompatibilityReleaseTrustProfileDigestInput);
}

/** 校验完整 Trust Profile 的结构、嵌套策略和自身摘要。 */
export function validateExecutorCompatibilityReleaseTrustProfile(
  input: unknown,
  digestPort: ExecutorCompatibilityReleaseTrustDigestPort,
): Result<ExecutorCompatibilityReleaseTrustProfile, HarnessError> {
  const parsed = executorCompatibilityReleaseTrustProfileSchema.safeParse(input);
  if (!parsed.success) {
    return invalidSchema(
      "Executor Compatibility Release Trust Profile Schema 非法。",
      parsed.error,
    );
  }
  const profileDigest = parsed.data.profileDigest;
  const digestInput = createExecutorCompatibilityReleaseTrustProfileDigestInput(parsed.data);
  const validated = validateExecutorCompatibilityReleaseTrustProfileDigestInput(
    digestInput,
    digestPort,
  );
  if (validated.status === ResultStatus.Failure) return validated;
  const digest = digestPort.calculate(
    createExecutorCompatibilityReleaseTrustProfileDigestInput(validated.value),
  );
  if (digest.status === ResultStatus.Failure) return digest;
  return digest.value === profileDigest
    ? success(parsed.data as ExecutorCompatibilityReleaseTrustProfile)
    : invalid("Executor Compatibility Release Trust Profile 摘要漂移。", {
        expectedProfileDigest: digest.value,
        actualProfileDigest: profileDigest,
      });
}

/** 校验 Profile 与 Release Subject 后，派生本次 Release 的完整身份策略。 */
export function deriveExecutorCompatibilityPublisherIdentityPolicy(
  input: DeriveExecutorCompatibilityPublisherIdentityPolicyInput,
  digestPort: ExecutorCompatibilityReleaseTrustDigestPort,
): Result<ExecutorCompatibilityPublisherIdentityPolicy, HarnessError> {
  const profile = validateExecutorCompatibilityReleaseTrustProfile(input.profile, digestPort);
  if (profile.status === ResultStatus.Failure) return profile;
  const subject = executorCompatibilityReleaseSubjectSchema.safeParse(input.releaseSubject);
  if (!subject.success) return invalid("Release Subject Schema 非法。");
  if (subject.data.packageName !== profile.value.packageName) {
    return invalid("Release Subject Package Name 与 Trust Profile 不一致。");
  }
  if (subject.data.repositoryUri !== profile.value.repositoryUri) {
    return invalid("Release Subject Repository URI 与 Trust Profile 不一致。");
  }
  const trustPolicy = profile.value.publisherTrustPolicy;
  const extensions = [
    ...trustPolicy.additionalCertificateExtensions,
    { oid: SIGSTORE_RUNNER_ENVIRONMENT_OID, value: trustPolicy.runnerEnvironment },
    { oid: SIGSTORE_SOURCE_REPOSITORY_URI_OID, value: profile.value.repositoryUri },
    { oid: SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID, value: subject.data.sourceRevision },
  ];
  if (trustPolicy.certificateIdentity.kind === ExecutorCompatibilityCertificateIdentityKind.Uri) {
    extensions.push({
      oid: SIGSTORE_BUILD_SIGNER_URI_OID,
      value: trustPolicy.certificateIdentity.value,
    });
  }
  return createExecutorCompatibilityPublisherIdentityPolicyFromDerivedInput(
    trustPolicy,
    extensions,
    digestPort,
  );
}

function createExecutorCompatibilityPublisherIdentityPolicyFromDerivedInput(
  trustPolicy: ExecutorCompatibilityPublisherTrustPolicy,
  extensions: readonly { oid: string; value: string }[],
  digestPort: ExecutorCompatibilityReleaseTrustDigestPort,
): Result<ExecutorCompatibilityPublisherIdentityPolicy, HarnessError> {
  return createExecutorCompatibilityPublisherIdentityPolicy(
    {
      schemaVersion: EXECUTOR_COMPATIBILITY_PUBLISHER_IDENTITY_POLICY_SCHEMA_VERSION,
      certificateIssuer: trustPolicy.certificateIssuer,
      certificateIdentity: { ...trustPolicy.certificateIdentity },
      certificateExtensions: extensions,
      ctLogThreshold: trustPolicy.ctLogThreshold,
      tlogThreshold: trustPolicy.tlogThreshold,
    },
    digestPort,
  );
}

function isSorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || (values[index - 1] ?? "") < value);
}

function invalidSchema(message: string, error: ZodError): Result<never, HarnessError> {
  const issue = error.issues[0];
  return invalid(message, {
    path: issue?.path.join(".") ?? "unknown",
    issue: issue?.message ?? "unknown",
  });
}

function invalid(
  message: string,
  details: Readonly<Record<string, string>> = {},
): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, details));
}
