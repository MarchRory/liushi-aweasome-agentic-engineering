import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import { validateExecutorCompatibilityPublicationBundle } from "#domain/executorCompatibilityPublication/index.js";

import {
  EXECUTOR_COMPATIBILITY_G6_APPROVAL_BINDING_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SUBJECT_NAME,
} from "../constants/index.js";
import type {
  CreateExecutorCompatibilityReleaseAttestationDraftInput,
  ExecutorCompatibilityAttestationDigestPort,
  ExecutorCompatibilityAttestationStatement,
  ExecutorCompatibilityG6ApprovalBinding,
} from "../contracts/index.js";
import { toExecutorCompatibilityInTotoSha256Hex } from "../digest/index.js";
import { executorCompatibilityAttestationStatementSchema } from "../schemas/index.js";
import {
  validateExecutorCompatibilityG6ApprovalBinding,
  validateExecutorCompatibilityG6ApprovalRecords,
} from "./g6ApprovalValidation.js";
import { validateExecutorCompatibilityPublisherIdentityPolicy } from "./publisherIdentityPolicyValidation.js";
import { validateExecutorCompatibilityReleaseCandidate } from "./releaseCandidateValidation.js";
import { attestationBindingMismatch, invalidAttestationSchema } from "./validationErrors.js";

/** 校验完整 in-toto Statement 的 Subject、Predicate 与全部摘要绑定。 */
export function validateExecutorCompatibilityAttestationStatement(
  input: unknown,
  context: CreateExecutorCompatibilityReleaseAttestationDraftInput,
  digestPort: ExecutorCompatibilityAttestationDigestPort,
): Result<ExecutorCompatibilityAttestationStatement, HarnessError> {
  const parsed = executorCompatibilityAttestationStatementSchema.safeParse(input);
  if (!parsed.success) {
    return invalidAttestationSchema(parsed.error, "in-toto Statement Schema 非法。");
  }
  const trustedCandidate = validateExecutorCompatibilityReleaseCandidate(
    context.releaseCandidate,
    {
      bundle: context.bundle,
      publisherIdentityPolicy: context.publisherIdentityPolicy,
      target: context.releaseCandidate.target,
    },
    digestPort,
  );
  if (trustedCandidate.status === ResultStatus.Failure) return trustedCandidate;
  const candidate = validateExecutorCompatibilityReleaseCandidate(
    parsed.data.predicate.releaseCandidate,
    {
      bundle: context.bundle,
      publisherIdentityPolicy: context.publisherIdentityPolicy,
      target: trustedCandidate.value.target,
    },
    digestPort,
  );
  if (candidate.status === ResultStatus.Failure) return candidate;
  if (candidate.value.candidateDigest !== trustedCandidate.value.candidateDigest) {
    return attestationBindingMismatch("in-toto Predicate Release Candidate 与受信输入不一致。");
  }
  const policy = validateExecutorCompatibilityPublisherIdentityPolicy(
    parsed.data.predicate.publisherIdentityPolicy,
    digestPort,
  );
  if (policy.status === ResultStatus.Failure) return policy;
  if (policy.value.identityPolicyDigest !== candidate.value.publisherIdentityPolicyDigest) {
    return attestationBindingMismatch(
      "in-toto Predicate Publisher Identity Policy 未绑定 Release Candidate。",
    );
  }
  const g6Approval = validateExecutorCompatibilityG6ApprovalBinding(
    parsed.data.predicate.g6Approval,
    candidate.value,
  );
  if (g6Approval.status === ResultStatus.Failure) return g6Approval;
  const records = validateExecutorCompatibilityG6ApprovalRecords(
    {
      releaseCandidate: trustedCandidate.value,
      decisionRequest: context.decisionRequest,
      approvalRecord: context.approvalRecord,
    },
    digestPort,
  );
  if (records.status === ResultStatus.Failure) return records;
  const expectedG6Approval: ExecutorCompatibilityG6ApprovalBinding = {
    schemaVersion: EXECUTOR_COMPATIBILITY_G6_APPROVAL_BINDING_SCHEMA_VERSION,
    gate: g6Approval.value.gate,
    decisionRequestDigest: records.value.decisionRequest.digest,
    approvalRecordDigest: records.value.approvalRecord.digest,
    releaseCandidateDigest: trustedCandidate.value.candidateDigest,
  };
  if (!sameG6Binding(g6Approval.value, expectedG6Approval)) {
    return attestationBindingMismatch(
      "in-toto Predicate 中的 G6 Approval Binding 与受信输入不一致。",
    );
  }
  const bundle = validateExecutorCompatibilityPublicationBundle(context.bundle, digestPort);
  if (bundle.status === ResultStatus.Failure) return bundle;
  const releaseSubject = compareCanonical(
    parsed.data.predicate.releaseSubject,
    bundle.value.releaseSubject,
    digestPort,
  );
  if (releaseSubject.status === ResultStatus.Failure) return releaseSubject;
  const executorScope = compareCanonical(
    parsed.data.predicate.executorScope,
    bundle.value.matrix.scope,
    digestPort,
  );
  if (executorScope.status === ResultStatus.Failure) return executorScope;
  const expectedSubjects = createExpectedSubjects(bundle.value);
  return sameSubjects(parsed.data.subject, expectedSubjects)
    ? success(parsed.data)
    : attestationBindingMismatch(
        "in-toto Statement Subject 与 Publication Bundle 或 Tarball 不一致。",
      );
}

/** 创建 Statement 验证和 Factory 共用的固定双 Subject。 */
export function createExecutorCompatibilityExpectedInTotoSubjects(
  bundle: CreateExecutorCompatibilityReleaseAttestationDraftInput["bundle"],
): ExecutorCompatibilityAttestationStatement["subject"] {
  return createExpectedSubjects(bundle);
}

function createExpectedSubjects(
  bundle: CreateExecutorCompatibilityReleaseAttestationDraftInput["bundle"],
): ExecutorCompatibilityAttestationStatement["subject"] {
  return [
    {
      name: EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SUBJECT_NAME,
      digest: { sha256: toExecutorCompatibilityInTotoSha256Hex(bundle.bundleDigest) },
    },
    {
      name: `npm:${bundle.releaseSubject.packageName}@${bundle.releaseSubject.packageVersion}`,
      digest: {
        sha256: toExecutorCompatibilityInTotoSha256Hex(bundle.releaseSubject.packageDigest),
      },
    },
  ];
}

function compareCanonical(
  actual: unknown,
  expected: unknown,
  digestPort: ExecutorCompatibilityAttestationDigestPort,
): Result<void, HarnessError> {
  const actualDigest = digestPort.calculate(actual);
  if (actualDigest.status === ResultStatus.Failure) return actualDigest;
  const expectedDigest = digestPort.calculate(expected);
  if (expectedDigest.status === ResultStatus.Failure) return expectedDigest;
  return actualDigest.value === expectedDigest.value
    ? success(undefined)
    : attestationBindingMismatch("in-toto Predicate 与 Publication Bundle 绑定不一致。");
}

function sameSubjects(
  left: ExecutorCompatibilityAttestationStatement["subject"],
  right: ExecutorCompatibilityAttestationStatement["subject"],
): boolean {
  return (
    left[0].name === right[0].name &&
    left[0].digest.sha256 === right[0].digest.sha256 &&
    left[1].name === right[1].name &&
    left[1].digest.sha256 === right[1].digest.sha256
  );
}

function sameG6Binding(
  left: ExecutorCompatibilityG6ApprovalBinding,
  right: ExecutorCompatibilityG6ApprovalBinding,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.gate === right.gate &&
    left.decisionRequestDigest === right.decisionRequestDigest &&
    left.approvalRecordDigest === right.approvalRecordDigest &&
    left.releaseCandidateDigest === right.releaseCandidateDigest
  );
}
