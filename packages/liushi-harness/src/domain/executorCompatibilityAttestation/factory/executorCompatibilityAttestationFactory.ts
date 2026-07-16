import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import { GateId } from "#domain/policy/index.js";

import {
  EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_TYPE,
  EXECUTOR_COMPATIBILITY_G6_APPROVAL_BINDING_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_PUBLISHER_IDENTITY_POLICY_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_CANDIDATE_SCHEMA_VERSION,
  IN_TOTO_STATEMENT_V1_TYPE,
} from "../constants/index.js";
import type {
  CreateExecutorCompatibilityG6ApprovalBindingInput,
  CreateExecutorCompatibilityPublisherIdentityPolicyInput,
  CreateExecutorCompatibilityReleaseAttestationDraftInput,
  CreateExecutorCompatibilityReleaseCandidateInput,
  ExecutorCompatibilityAttestationDigestPort,
  ExecutorCompatibilityAttestationStatement,
  ExecutorCompatibilityG6ApprovalBinding,
  ExecutorCompatibilityPublisherIdentityPolicy,
  ExecutorCompatibilityPublisherIdentityPolicyDigestInput,
  ExecutorCompatibilityReleaseAttestationDraft,
  ExecutorCompatibilityReleaseCandidate,
  ExecutorCompatibilityReleaseCandidateDigestInput,
} from "../contracts/index.js";
import {
  createExecutorCompatibilityPublisherIdentityPolicyDigestInput,
  createExecutorCompatibilityReleaseCandidateDigestInput,
  normalizeExecutorCompatibilityPublisherCertificateExtensions,
} from "../digest/index.js";
import {
  createExecutorCompatibilityExpectedInTotoSubjects,
  validateExecutorCompatibilityAttestationStatement,
  validateExecutorCompatibilityG6ApprovalBinding,
  validateExecutorCompatibilityG6ApprovalRecords,
  validateExecutorCompatibilityPublisherIdentityPolicy,
  validateExecutorCompatibilityPublisherIdentityPolicyDigestInput,
  validateExecutorCompatibilityReleaseCandidate,
  validateExecutorCompatibilityReleaseCandidateDigestInput,
} from "../validation/index.js";

/** 从精确证书身份约束创建确定性的 Publisher Identity Policy。 */
export function createExecutorCompatibilityPublisherIdentityPolicy(
  input: CreateExecutorCompatibilityPublisherIdentityPolicyInput,
  digestPort: ExecutorCompatibilityAttestationDigestPort,
): Result<ExecutorCompatibilityPublisherIdentityPolicy, HarnessError> {
  const candidate: ExecutorCompatibilityPublisherIdentityPolicyDigestInput = {
    schemaVersion: EXECUTOR_COMPATIBILITY_PUBLISHER_IDENTITY_POLICY_SCHEMA_VERSION,
    certificateIssuer: input.certificateIssuer,
    certificateIdentity: { ...input.certificateIdentity },
    certificateExtensions: normalizeExecutorCompatibilityPublisherCertificateExtensions(
      input.certificateExtensions,
    ),
    ctLogThreshold: input.ctLogThreshold,
    tlogThreshold: input.tlogThreshold,
  };
  const validated = validateExecutorCompatibilityPublisherIdentityPolicyDigestInput(candidate);
  if (validated.status === ResultStatus.Failure) return validated;
  const digest = digestPort.calculate(
    createExecutorCompatibilityPublisherIdentityPolicyDigestInput(validated.value),
  );
  if (digest.status === ResultStatus.Failure) return digest;
  return validateExecutorCompatibilityPublisherIdentityPolicy(
    { ...validated.value, identityPolicyDigest: digest.value },
    digestPort,
  );
}

/** 从已复验 Bundle、Identity Policy 与 Target 创建 G6 Release Candidate。 */
export function createExecutorCompatibilityReleaseCandidate(
  input: CreateExecutorCompatibilityReleaseCandidateInput,
  digestPort: ExecutorCompatibilityAttestationDigestPort,
): Result<ExecutorCompatibilityReleaseCandidate, HarnessError> {
  const candidate: ExecutorCompatibilityReleaseCandidateDigestInput = {
    schemaVersion: EXECUTOR_COMPATIBILITY_RELEASE_CANDIDATE_SCHEMA_VERSION,
    bundleDigest: input.bundle.bundleDigest,
    matrixDigest: input.bundle.matrix.matrixDigest,
    packageDigest: input.bundle.releaseSubject.packageDigest,
    publisherIdentityPolicyDigest: input.publisherIdentityPolicy.identityPolicyDigest,
    target: { ...input.target },
  };
  const validated = validateExecutorCompatibilityReleaseCandidateDigestInput(
    candidate,
    input,
    digestPort,
  );
  if (validated.status === ResultStatus.Failure) return validated;
  const digest = digestPort.calculate(
    createExecutorCompatibilityReleaseCandidateDigestInput(validated.value),
  );
  if (digest.status === ResultStatus.Failure) return digest;
  return validateExecutorCompatibilityReleaseCandidate(
    { ...validated.value, candidateDigest: digest.value },
    input,
    digestPort,
  );
}

/** 从真实 Human Decision 与 Approval 创建精确的 G6 Approval Binding。 */
export function createExecutorCompatibilityG6ApprovalBinding(
  input: CreateExecutorCompatibilityG6ApprovalBindingInput,
  digestPort: ExecutorCompatibilityAttestationDigestPort,
): Result<ExecutorCompatibilityG6ApprovalBinding, HarnessError> {
  const records = validateExecutorCompatibilityG6ApprovalRecords(input, digestPort);
  if (records.status === ResultStatus.Failure) return records;
  return validateExecutorCompatibilityG6ApprovalBinding(
    {
      schemaVersion: EXECUTOR_COMPATIBILITY_G6_APPROVAL_BINDING_SCHEMA_VERSION,
      gate: GateId.G6MergeRelease,
      decisionRequestDigest: records.value.decisionRequest.digest,
      approvalRecordDigest: records.value.approvalRecord.digest,
      releaseCandidateDigest: input.releaseCandidate.candidateDigest,
    },
    input.releaseCandidate,
  );
}

/** 从完整受信输入创建等待 Sigstore Adapter 签名的 in-toto Statement。 */
export function createExecutorCompatibilityReleaseAttestationDraft(
  input: CreateExecutorCompatibilityReleaseAttestationDraftInput,
  digestPort: ExecutorCompatibilityAttestationDigestPort,
): Result<ExecutorCompatibilityReleaseAttestationDraft, HarnessError> {
  const records = validateExecutorCompatibilityG6ApprovalRecords(
    {
      releaseCandidate: input.releaseCandidate,
      decisionRequest: input.decisionRequest,
      approvalRecord: input.approvalRecord,
    },
    digestPort,
  );
  if (records.status === ResultStatus.Failure) return records;
  const g6Approval = createExecutorCompatibilityG6ApprovalBinding(
    {
      releaseCandidate: input.releaseCandidate,
      decisionRequest: records.value.decisionRequest,
      approvalRecord: records.value.approvalRecord,
    },
    digestPort,
  );
  if (g6Approval.status === ResultStatus.Failure) return g6Approval;
  const statement = createAttestationStatement(input, g6Approval.value, digestPort);
  return statement.status === ResultStatus.Failure
    ? statement
    : {
        status: ResultStatus.Success,
        value: {
          bundle: input.bundle,
          publisherIdentityPolicy: input.publisherIdentityPolicy,
          releaseCandidate: input.releaseCandidate,
          decisionRequest: records.value.decisionRequest,
          approvalRecord: records.value.approvalRecord,
          g6Approval: g6Approval.value,
          statement: statement.value,
        },
      };
}

function createAttestationStatement(
  input: CreateExecutorCompatibilityReleaseAttestationDraftInput,
  g6Approval: ExecutorCompatibilityG6ApprovalBinding,
  digestPort: ExecutorCompatibilityAttestationDigestPort,
): Result<ExecutorCompatibilityAttestationStatement, HarnessError> {
  const statement: ExecutorCompatibilityAttestationStatement = {
    _type: IN_TOTO_STATEMENT_V1_TYPE,
    subject: createExecutorCompatibilityExpectedInTotoSubjects(input.bundle),
    predicateType: EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_TYPE,
    predicate: {
      schemaVersion: EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_SCHEMA_VERSION,
      releaseCandidate: input.releaseCandidate,
      releaseSubject: input.bundle.releaseSubject,
      executorScope: input.bundle.matrix.scope,
      publisherIdentityPolicy: input.publisherIdentityPolicy,
      g6Approval,
    },
  };
  return validateExecutorCompatibilityAttestationStatement(
    statement,
    {
      bundle: input.bundle,
      publisherIdentityPolicy: input.publisherIdentityPolicy,
      releaseCandidate: input.releaseCandidate,
      decisionRequest: input.decisionRequest,
      approvalRecord: input.approvalRecord,
    },
    digestPort,
  );
}
