import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import { EXECUTOR_COMPATIBILITY_PUBLICATION_SOURCE_REVISION_PATTERN } from "#domain/executorCompatibilityPublication/index.js";

import {
  SIGSTORE_BUILD_SIGNER_URI_OID,
  SIGSTORE_RUNNER_ENVIRONMENT_OID,
  SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID,
  SIGSTORE_SOURCE_REPOSITORY_URI_OID,
} from "../constants/index.js";
import type {
  ExecutorCompatibilityAttestationDigestPort,
  ExecutorCompatibilityPublisherIdentityPolicy,
  ExecutorCompatibilityPublisherIdentityPolicyDigestInput,
} from "../contracts/index.js";
import { createExecutorCompatibilityPublisherIdentityPolicyDigestInput } from "../digest/index.js";
import { ExecutorCompatibilityCertificateIdentityKind } from "../enums/index.js";
import {
  executorCompatibilityPublisherIdentityPolicyDigestInputSchema,
  executorCompatibilityPublisherIdentityPolicySchema,
} from "../schemas/index.js";
import { invalidAttestationInput, invalidAttestationSchema } from "./validationErrors.js";

/** 校验不含自身摘要的 Publisher Identity Policy 候选。 */
export function validateExecutorCompatibilityPublisherIdentityPolicyDigestInput(
  input: unknown,
): Result<ExecutorCompatibilityPublisherIdentityPolicyDigestInput, HarnessError> {
  const parsed = executorCompatibilityPublisherIdentityPolicyDigestInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidAttestationSchema(parsed.error, "Publisher Identity Policy Schema 非法。");
  }
  const policy = parsed.data;
  const duplicateOid = findDuplicateOid(policy.certificateExtensions.map((item) => item.oid));
  if (duplicateOid !== undefined) {
    return invalidAttestationInput("Publisher Identity Policy 包含重复证书扩展 OID。", {
      oid: duplicateOid,
    });
  }
  if (!hasCanonicalExtensionOrder(policy.certificateExtensions)) {
    return invalidAttestationInput("Publisher Identity Policy 的证书扩展未按 OID 稳定排序。");
  }
  if (
    !policy.certificateExtensions.some(
      (extension) => extension.oid === SIGSTORE_SOURCE_REPOSITORY_URI_OID,
    )
  ) {
    return invalidAttestationInput(
      "Publisher Identity Policy 必须固定 Source Repository URI 证书扩展。",
    );
  }
  if (
    !policy.certificateExtensions.some(
      (extension) => extension.oid === SIGSTORE_RUNNER_ENVIRONMENT_OID,
    )
  ) {
    return invalidAttestationInput(
      "Publisher Identity Policy 必须固定 Runner Environment 证书扩展。",
    );
  }
  const sourceRevision = policy.certificateExtensions.find(
    (extension) => extension.oid === SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID,
  );
  if (sourceRevision === undefined) {
    return invalidAttestationInput(
      "Publisher Identity Policy 必须固定 Source Repository Digest 证书扩展。",
    );
  }
  if (!EXECUTOR_COMPATIBILITY_PUBLICATION_SOURCE_REVISION_PATTERN.test(sourceRevision.value)) {
    return invalidAttestationInput(
      "Publisher Identity Policy 的 Source Repository Digest 不是完整 Git Revision。",
    );
  }
  if (
    policy.certificateIdentity.kind === ExecutorCompatibilityCertificateIdentityKind.Uri &&
    !policy.certificateExtensions.some(
      (extension) =>
        extension.oid === SIGSTORE_BUILD_SIGNER_URI_OID &&
        extension.value === policy.certificateIdentity.value,
    )
  ) {
    return invalidAttestationInput(
      "URI Publisher Identity 必须固定相同的 Build Signer URI 证书扩展。",
    );
  }
  return success(policy);
}

/** 校验完整 Publisher Identity Policy 的规范顺序与自身摘要。 */
export function validateExecutorCompatibilityPublisherIdentityPolicy(
  input: unknown,
  digestPort: ExecutorCompatibilityAttestationDigestPort,
): Result<ExecutorCompatibilityPublisherIdentityPolicy, HarnessError> {
  const parsed = executorCompatibilityPublisherIdentityPolicySchema.safeParse(input);
  if (!parsed.success) {
    return invalidAttestationSchema(parsed.error, "Publisher Identity Policy Schema 非法。");
  }
  const digestInput = createExecutorCompatibilityPublisherIdentityPolicyDigestInput(parsed.data);
  const semantics = validateExecutorCompatibilityPublisherIdentityPolicyDigestInput(digestInput);
  if (semantics.status === ResultStatus.Failure) return semantics;
  const digest = digestPort.calculate(
    createExecutorCompatibilityPublisherIdentityPolicyDigestInput(semantics.value),
  );
  if (digest.status === ResultStatus.Failure) return digest;
  return digest.value === parsed.data.identityPolicyDigest
    ? success(parsed.data)
    : invalidAttestationInput("Publisher Identity Policy 摘要漂移。", {
        expectedIdentityPolicyDigest: digest.value,
        actualIdentityPolicyDigest: parsed.data.identityPolicyDigest,
      });
}

function hasCanonicalExtensionOrder(extensions: readonly Readonly<{ oid: string }>[]): boolean {
  return extensions.every(
    (extension, index) => index === 0 || (extensions[index - 1]?.oid ?? "") < extension.oid,
  );
}

function findDuplicateOid(oids: readonly string[]): string | undefined {
  return oids.find((oid, index) => oids.indexOf(oid) !== index);
}
