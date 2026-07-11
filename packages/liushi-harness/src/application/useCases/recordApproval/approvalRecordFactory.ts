import type { ArtifactDigestPort } from "#application/ports/index.js";
import {
  APPROVAL_RECORD_SCHEMA_VERSION,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import {
  parseApprovalId,
  parseApprovalRecord,
  type ApprovalId,
  type ApprovalRecord,
  type ApprovalRecordDigestInput,
  type DecisionRequest,
} from "#domain/approval/index.js";

import type { ApprovalSubmission } from "./approvalSubmission.js";

/** 从精确绑定的 DecisionRequest 和已校验 Human 输入创建 ApprovalRecord。 */
export function createApprovalRecord(
  decisionRequest: DecisionRequest,
  submission: ApprovalSubmission,
  createdAt: string,
  approvalIdGenerator: IdGenerator,
  digestPort: ArtifactDigestPort,
): Result<ApprovalRecord, HarnessError> {
  const approvalId = nextApprovalId(approvalIdGenerator);
  if (approvalId.status === ResultStatus.Failure) {
    return approvalId;
  }
  const digestInput: ApprovalRecordDigestInput = {
    schemaVersion: APPROVAL_RECORD_SCHEMA_VERSION,
    approvalId: approvalId.value,
    decisionRequestId: decisionRequest.decisionRequestId,
    decisionRequestDigest: decisionRequest.digest,
    gate: decisionRequest.gate,
    artifactId: decisionRequest.artifactId,
    artifactDigest: decisionRequest.artifactDigest,
    idempotencyKey: submission.idempotencyKey,
    actor: submission.actor,
    decision: submission.decision,
    ...(submission.reason === undefined ? {} : { reason: submission.reason }),
    createdAt,
  };
  const digest = digestPort.calculate(digestInput);
  return digest.status === ResultStatus.Failure
    ? digest
    : parseApprovalRecord({ ...digestInput, digest: digest.value });
}

function nextApprovalId(generator: IdGenerator): Result<ApprovalId, HarnessError> {
  try {
    return parseApprovalId(generator.next());
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.IoFailure,
        "Approval ID generator failed.",
        { operation: "approvalIdGenerator.next" },
        error,
      ),
    );
  }
}
