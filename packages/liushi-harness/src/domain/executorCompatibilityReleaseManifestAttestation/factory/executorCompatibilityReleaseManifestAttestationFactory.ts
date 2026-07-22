import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ExecutorCompatibilityReleaseApprovalSubject,
  IN_TOTO_STATEMENT_V1_TYPE,
  toExecutorCompatibilityInTotoSha256Hex,
  validateExecutorCompatibilityPublisherIdentityPolicy,
  validateExecutorCompatibilityReleaseG6ApprovalRecords,
} from "#domain/executorCompatibilityAttestation/index.js";
import { validateExecutorCompatibilityReleaseManifestIntegrity } from "#domain/executorCompatibilityReleaseManifest/index.js";

import { createExecutorCompatibilityReleaseManifestG6ApprovalBindingValue } from "../binding/index.js";
import {
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_TYPE,
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SUBJECT_NAME,
} from "../constants/index.js";
import type {
  CreateExecutorCompatibilityReleaseManifestAttestationDraftInput,
  CreateExecutorCompatibilityReleaseManifestG6ApprovalBindingInput,
  ExecutorCompatibilityReleaseManifestAttestationDigestPort,
  ExecutorCompatibilityReleaseManifestAttestationDraft,
  ExecutorCompatibilityReleaseManifestAttestationStatement,
  ExecutorCompatibilityReleaseManifestG6ApprovalBinding,
} from "../contracts/index.js";
import { executorCompatibilityReleaseManifestAttestationCreateInputSchema } from "../schemas/index.js";
import {
  validateExecutorCompatibilityReleaseManifestAttestationStatement,
  validateExecutorCompatibilityReleaseManifestG6ApprovalBinding,
} from "../validation/index.js";

/** 创建独立的 Manifest-specific G6 Approval Binding。 */
export function createExecutorCompatibilityReleaseManifestG6ApprovalBinding(
  input: CreateExecutorCompatibilityReleaseManifestG6ApprovalBindingInput,
  digestPort: ExecutorCompatibilityReleaseManifestAttestationDigestPort,
): Result<ExecutorCompatibilityReleaseManifestG6ApprovalBinding, HarnessError> {
  const manifest = validateExecutorCompatibilityReleaseManifestIntegrity(
    input.manifest,
    digestPort,
  );
  if (manifest.status === ResultStatus.Failure) return manifest;
  const records = validateExecutorCompatibilityReleaseG6ApprovalRecords(
    {
      artifactDigest: manifest.value.manifestDigest,
      decisionRequest: input.decisionRequest,
      approvalRecord: input.approvalRecord,
      approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
    },
    digestPort,
  );
  if (records.status === ResultStatus.Failure) return records;
  return validateExecutorCompatibilityReleaseManifestG6ApprovalBinding(
    createExecutorCompatibilityReleaseManifestG6ApprovalBindingValue({
      decisionRequestDigest: records.value.decisionRequest.digest,
      approvalRecordDigest: records.value.approvalRecord.digest,
      manifestDigest: manifest.value.manifestDigest,
    }),
    manifest.value.manifestDigest,
  );
}

/** 从完整 Manifest、Identity Policy 与 Human 记录创建确定性 Draft。 */
export function createExecutorCompatibilityReleaseManifestAttestationDraft(
  input: CreateExecutorCompatibilityReleaseManifestAttestationDraftInput,
  digestPort: ExecutorCompatibilityReleaseManifestAttestationDigestPort,
): Result<ExecutorCompatibilityReleaseManifestAttestationDraft, HarnessError> {
  const parsed = executorCompatibilityReleaseManifestAttestationCreateInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalid("Manifest Attestation Draft 创建输入 Schema 非法。");
  }
  const createInput =
    parsed.data as unknown as CreateExecutorCompatibilityReleaseManifestAttestationDraftInput;
  const manifest = validateExecutorCompatibilityReleaseManifestIntegrity(
    createInput.manifest,
    digestPort,
  );
  if (manifest.status === ResultStatus.Failure) return manifest;
  const policy = validateExecutorCompatibilityPublisherIdentityPolicy(
    createInput.publisherIdentityPolicy,
    digestPort,
  );
  if (policy.status === ResultStatus.Failure) return policy;
  if (manifest.value.publisherIdentityPolicyDigest !== policy.value.identityPolicyDigest) {
    return invalid(
      "Manifest publisherIdentityPolicyDigest 与 Publisher Identity Policy 摘要不一致。",
    );
  }
  const g6Approval = createExecutorCompatibilityReleaseManifestG6ApprovalBinding(
    {
      manifest: manifest.value,
      decisionRequest: createInput.decisionRequest,
      approvalRecord: createInput.approvalRecord,
    },
    digestPort,
  );
  if (g6Approval.status === ResultStatus.Failure) return g6Approval;
  const statement: ExecutorCompatibilityReleaseManifestAttestationStatement = {
    _type: IN_TOTO_STATEMENT_V1_TYPE,
    subject: [
      {
        name: EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SUBJECT_NAME,
        digest: {
          sha256: toExecutorCompatibilityInTotoSha256Hex(manifest.value.manifestDigest),
        },
      },
    ],
    predicateType: EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_TYPE,
    predicate: {
      schemaVersion: EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_SCHEMA_VERSION,
      manifest: manifest.value,
      publisherIdentityPolicy: policy.value,
      g6Approval: g6Approval.value,
    },
  };
  const validatedStatement = validateExecutorCompatibilityReleaseManifestAttestationStatement(
    statement,
    {
      manifest: manifest.value,
      publisherIdentityPolicy: policy.value,
      decisionRequest: createInput.decisionRequest,
      approvalRecord: createInput.approvalRecord,
    },
    digestPort,
  );
  if (validatedStatement.status === ResultStatus.Failure) return validatedStatement;
  return success({
    manifest: manifest.value,
    publisherIdentityPolicy: policy.value,
    decisionRequest: createInput.decisionRequest,
    approvalRecord: createInput.approvalRecord,
    g6Approval: g6Approval.value,
    statement: validatedStatement.value,
  });
}

function invalid(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
