import { ActorKind, ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import {
  ApprovalDecision,
  parseApprovalRecord,
  parseDecisionRequest,
  type ApprovalRecord,
  type ApprovalRecordDigestInput,
  type DecisionRequest,
  type DecisionRequestDigestInput,
} from "#domain/approval/index.js";
import { GateId, RiskLevel } from "#domain/policy/index.js";
import { TaskPhase } from "#domain/task/index.js";

import {
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_ACTION,
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVED_CHECKPOINT,
} from "../constants/index.js";
import type {
  CreateExecutorCompatibilityG6ApprovalBindingInput,
  ExecutorCompatibilityAttestationDigestPort,
  ExecutorCompatibilityG6ApprovalBinding,
  ExecutorCompatibilityReleaseCandidate,
} from "../contracts/index.js";
import { executorCompatibilityG6ApprovalBindingSchema } from "../schemas/index.js";
import { attestationBindingMismatch, invalidAttestationSchema } from "./validationErrors.js";

/** 校验真实 DecisionRequest 与 Human Approval 对精确 Candidate 的 G6 绑定。 */
export function validateExecutorCompatibilityG6ApprovalRecords(
  input: CreateExecutorCompatibilityG6ApprovalBindingInput,
  digestPort: ExecutorCompatibilityAttestationDigestPort,
): Result<
  Readonly<{ decisionRequest: DecisionRequest; approvalRecord: ApprovalRecord }>,
  HarnessError
> {
  const decisionRequest = parseDecisionRequest(input.decisionRequest);
  if (decisionRequest.status === ResultStatus.Failure) return decisionRequest;
  const approvalRecord = parseApprovalRecord(input.approvalRecord);
  if (approvalRecord.status === ResultStatus.Failure) return approvalRecord;
  const decisionDigest = digestPort.calculate(
    createDecisionRequestDigestInput(decisionRequest.value),
  );
  if (decisionDigest.status === ResultStatus.Failure) return decisionDigest;
  if (decisionDigest.value !== decisionRequest.value.digest) {
    return attestationBindingMismatch("G6 DecisionRequest 摘要漂移。");
  }
  const approvalDigest = digestPort.calculate(
    createApprovalRecordDigestInput(approvalRecord.value),
  );
  if (approvalDigest.status === ResultStatus.Failure) return approvalDigest;
  if (approvalDigest.value !== approvalRecord.value.digest) {
    return attestationBindingMismatch("G6 ApprovalRecord 摘要漂移。");
  }
  const request = decisionRequest.value;
  const approval = approvalRecord.value;
  if (request.gate !== GateId.G6MergeRelease || approval.gate !== GateId.G6MergeRelease) {
    return attestationBindingMismatch("Release Attestation 只接受 G6 Merge/Release Approval。");
  }
  if (!hasExactReleaseSemantics(request)) {
    return attestationBindingMismatch("G6 DecisionRequest 的 Release 语义不完整或发生漂移。");
  }
  if (request.artifactDigest !== input.releaseCandidate.candidateDigest) {
    return attestationBindingMismatch("G6 DecisionRequest 未绑定精确 Release Candidate Digest。");
  }
  if (approval.actor.kind !== ActorKind.Human) {
    return attestationBindingMismatch("G6 ApprovalRecord 必须由 Human Actor 创建。");
  }
  if (approval.decision !== ApprovalDecision.Approved) {
    return attestationBindingMismatch("G6 ApprovalRecord 必须明确批准 Release Candidate。");
  }
  if (!approvalMatchesRequest(approval, request)) {
    return attestationBindingMismatch("G6 ApprovalRecord 未精确匹配 DecisionRequest。");
  }
  if (Date.parse(approval.createdAt) < Date.parse(request.createdAt)) {
    return attestationBindingMismatch("G6 ApprovalRecord 不能早于 DecisionRequest 创建。");
  }
  return success({ decisionRequest: request, approvalRecord: approval });
}

/** 校验 Predicate 中的 G6 Approval Binding 与当前 Candidate 一致。 */
export function validateExecutorCompatibilityG6ApprovalBinding(
  input: unknown,
  releaseCandidate: ExecutorCompatibilityReleaseCandidate,
): Result<ExecutorCompatibilityG6ApprovalBinding, HarnessError> {
  const parsed = executorCompatibilityG6ApprovalBindingSchema.safeParse(input);
  if (!parsed.success) {
    return invalidAttestationSchema(parsed.error, "G6 Approval Binding Schema 非法。");
  }
  return parsed.data.releaseCandidateDigest === releaseCandidate.candidateDigest
    ? success(parsed.data)
    : attestationBindingMismatch("G6 Approval Binding 未绑定当前 Release Candidate。");
}

function hasExactReleaseSemantics(request: DecisionRequest): boolean {
  return (
    request.riskLevel === RiskLevel.R4 &&
    request.resumePhase === TaskPhase.Review &&
    request.resumeCheckpoint === EXECUTOR_COMPATIBILITY_RELEASE_APPROVED_CHECKPOINT &&
    request.requiredAction === EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_ACTION &&
    request.writeSetDigest === undefined &&
    request.baseRevision === undefined
  );
}

function approvalMatchesRequest(approval: ApprovalRecord, request: DecisionRequest): boolean {
  return (
    approval.decisionRequestId === request.decisionRequestId &&
    approval.decisionRequestDigest === request.digest &&
    approval.artifactId === request.artifactId &&
    approval.artifactDigest === request.artifactDigest
  );
}

function createDecisionRequestDigestInput(request: DecisionRequest): DecisionRequestDigestInput {
  return {
    schemaVersion: request.schemaVersion,
    decisionRequestId: request.decisionRequestId,
    taskId: request.taskId,
    gate: request.gate,
    artifactId: request.artifactId,
    artifactDigest: request.artifactDigest,
    riskLevel: request.riskLevel,
    resumePhase: request.resumePhase,
    resumeCheckpoint: request.resumeCheckpoint,
    requiredAction: request.requiredAction,
    ...(request.writeSetDigest === undefined ? {} : { writeSetDigest: request.writeSetDigest }),
    ...(request.baseRevision === undefined ? {} : { baseRevision: request.baseRevision }),
    createdAt: request.createdAt,
    createdBy: request.createdBy,
  };
}

function createApprovalRecordDigestInput(approval: ApprovalRecord): ApprovalRecordDigestInput {
  return {
    schemaVersion: approval.schemaVersion,
    approvalId: approval.approvalId,
    decisionRequestId: approval.decisionRequestId,
    decisionRequestDigest: approval.decisionRequestDigest,
    gate: approval.gate,
    artifactId: approval.artifactId,
    artifactDigest: approval.artifactDigest,
    idempotencyKey: approval.idempotencyKey,
    actor: approval.actor,
    decision: approval.decision,
    ...(approval.reason === undefined ? {} : { reason: approval.reason }),
    createdAt: approval.createdAt,
  };
}
