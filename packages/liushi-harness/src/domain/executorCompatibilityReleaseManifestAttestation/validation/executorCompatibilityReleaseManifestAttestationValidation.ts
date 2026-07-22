import type { ZodError } from "zod";

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
  ExecutorCompatibilityReleaseApprovalSubject,
  toExecutorCompatibilityInTotoSha256Hex,
  validateExecutorCompatibilityPublisherIdentityPolicy,
  validateExecutorCompatibilityReleaseG6ApprovalRecords,
} from "#domain/executorCompatibilityAttestation/index.js";
import { validateExecutorCompatibilityReleaseManifestIntegrity } from "#domain/executorCompatibilityReleaseManifest/index.js";

import { createExecutorCompatibilityReleaseManifestG6ApprovalBindingValue } from "../binding/index.js";
import { sameExecutorCompatibilityReleaseManifestAttestationCanonicalValue } from "../comparison/index.js";
import { EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SUBJECT_NAME } from "../constants/index.js";
import type {
  ExecutorCompatibilityReleaseManifestAttestationDigestPort,
  ExecutorCompatibilityReleaseManifestAttestationStatement,
  ExecutorCompatibilityReleaseManifestAttestationStatementContext,
  ExecutorCompatibilityReleaseManifestG6ApprovalBinding,
} from "../contracts/index.js";
import {
  executorCompatibilityReleaseManifestAttestationStatementSchema,
  executorCompatibilityReleaseManifestG6ApprovalBindingSchema,
} from "../schemas/index.js";

/** 校验 Manifest-specific G6 Binding 是否绑定当前 Manifest。 */
export function validateExecutorCompatibilityReleaseManifestG6ApprovalBinding(
  input: unknown,
  manifestDigest: ContentDigest,
): Result<ExecutorCompatibilityReleaseManifestG6ApprovalBinding, HarnessErrorType> {
  const parsed = executorCompatibilityReleaseManifestG6ApprovalBindingSchema.safeParse(input);
  if (!parsed.success) {
    return invalidSchema(parsed.error, "Manifest G6 Approval Binding Schema 非法。");
  }
  return parsed.data.manifestDigest === manifestDigest
    ? success(parsed.data)
    : bindingMismatch("Manifest G6 Approval Binding 未绑定当前 Manifest。");
}

/** 校验单 Subject Statement 的完整 Manifest、Policy 与 G6 交叉绑定。 */
export function validateExecutorCompatibilityReleaseManifestAttestationStatement(
  input: unknown,
  context: ExecutorCompatibilityReleaseManifestAttestationStatementContext,
  digestPort: ExecutorCompatibilityReleaseManifestAttestationDigestPort,
): Result<ExecutorCompatibilityReleaseManifestAttestationStatement, HarnessErrorType> {
  const parsed = executorCompatibilityReleaseManifestAttestationStatementSchema.safeParse(input);
  if (!parsed.success) {
    return invalidSchema(parsed.error, "Manifest Attestation Statement Schema 非法。");
  }
  const manifest = validateExecutorCompatibilityReleaseManifestIntegrity(
    context.manifest,
    digestPort,
  );
  if (manifest.status === ResultStatus.Failure) return manifest;
  const policy = validateExecutorCompatibilityPublisherIdentityPolicy(
    context.publisherIdentityPolicy,
    digestPort,
  );
  if (policy.status === ResultStatus.Failure) return policy;
  if (policy.value.identityPolicyDigest !== manifest.value.publisherIdentityPolicyDigest) {
    return bindingMismatch("Manifest Attestation Publisher Identity Policy Digest 不匹配。");
  }
  const records = validateExecutorCompatibilityReleaseG6ApprovalRecords(
    {
      artifactDigest: manifest.value.manifestDigest,
      decisionRequest: context.decisionRequest,
      approvalRecord: context.approvalRecord,
      approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
    },
    digestPort,
  );
  if (records.status === ResultStatus.Failure) return records;
  const binding = createExecutorCompatibilityReleaseManifestG6ApprovalBindingValue({
    manifestDigest: manifest.value.manifestDigest,
    decisionRequestDigest: records.value.decisionRequest.digest,
    approvalRecordDigest: records.value.approvalRecord.digest,
  });
  const predicateBinding = validateExecutorCompatibilityReleaseManifestG6ApprovalBinding(
    parsed.data.predicate.g6Approval,
    manifest.value.manifestDigest,
  );
  if (predicateBinding.status === ResultStatus.Failure) return predicateBinding;
  const subject = parsed.data.subject[0];
  if (
    subject.name !== EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SUBJECT_NAME ||
    subject.digest.sha256 !== toExecutorCompatibilityInTotoSha256Hex(manifest.value.manifestDigest)
  ) {
    return bindingMismatch("Manifest Attestation Subject 未绑定 Manifest Digest。");
  }
  const manifestEqual = sameExecutorCompatibilityReleaseManifestAttestationCanonicalValue(
    parsed.data.predicate.manifest,
    manifest.value,
    digestPort,
  );
  if (manifestEqual.status === ResultStatus.Failure) return manifestEqual;
  const policyEqual = sameExecutorCompatibilityReleaseManifestAttestationCanonicalValue(
    parsed.data.predicate.publisherIdentityPolicy,
    policy.value,
    digestPort,
  );
  if (policyEqual.status === ResultStatus.Failure) return policyEqual;
  const bindingEqual = sameExecutorCompatibilityReleaseManifestAttestationCanonicalValue(
    parsed.data.predicate.g6Approval,
    binding,
    digestPort,
  );
  if (bindingEqual.status === ResultStatus.Failure) return bindingEqual;
  return manifestEqual.value && policyEqual.value && bindingEqual.value
    ? success(parsed.data as ExecutorCompatibilityReleaseManifestAttestationStatement)
    : bindingMismatch("Manifest Attestation Predicate 与受信输入不一致。");
}

function invalidSchema(error: ZodError, message: string): Result<never, HarnessErrorType> {
  const issue = error.issues[0];
  return failure(
    new HarnessError(
      HarnessErrorCode.InvalidInput,
      message,
      {
        path: issue?.path.join(".") ?? "unknown",
        issue: issue?.message ?? "unknown",
      },
      error,
    ),
  );
}

function bindingMismatch(message: string): Result<never, HarnessErrorType> {
  return failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, message));
}
