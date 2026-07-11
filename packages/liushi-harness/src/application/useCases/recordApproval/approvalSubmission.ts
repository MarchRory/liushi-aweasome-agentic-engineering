import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  validateActorRef,
  type ActorRef,
  type Result,
} from "#common/index.js";
import {
  ApprovalDecision,
  MAX_APPROVAL_IDEMPOTENCY_KEY_LENGTH,
  MAX_APPROVAL_REASON_LENGTH,
  parseDecisionRequestId,
  type DecisionRequestId,
} from "#domain/approval/index.js";
import { parseArtifactDigest, type ArtifactDigest } from "#domain/artifact/index.js";

import type { RecordApprovalInput } from "./recordApproval.input.js";

/** 已完成边界校验、可用于创建 ApprovalRecord 的输入。 */
export interface ApprovalSubmission {
  /** 已校验的 DecisionRequest ID。 */
  decisionRequestId: DecisionRequestId;
  /** 已校验的 DecisionRequest Digest。 */
  decisionRequestDigest: ArtifactDigest;
  /** 已校验的稳定幂等键。 */
  idempotencyKey: string;
  /** 已确认属于 Human 的 Actor。 */
  actor: ActorRef;
  /** 已校验的封闭决策值。 */
  decision: ApprovalDecision;
  /** 可选的决策原因。 */
  reason?: string;
}

/** 校验不受信任的 Approval 输入，且不产生 ID、时间或持久化副作用。 */
export function parseApprovalSubmission(
  input: RecordApprovalInput,
): Result<ApprovalSubmission, HarnessError> {
  const decisionRequestId = parseDecisionRequestId(input.decisionRequestId);
  if (decisionRequestId.status === ResultStatus.Failure) {
    return decisionRequestId;
  }
  const decisionRequestDigest = parseArtifactDigest(input.decisionRequestDigest);
  if (decisionRequestDigest.status === ResultStatus.Failure) {
    return decisionRequestDigest;
  }
  const actor = validateActorRef(input.actor);
  if (actor.status === ResultStatus.Failure) {
    return actor;
  }
  if (actor.value.kind !== ActorKind.Human) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "Approval can only be recorded by a Human actor.",
      ),
    );
  }
  if (!isApprovalDecision(input.decision)) {
    return invalidInput("decision", "Approval decision is not supported.");
  }
  if (!isBoundedText(input.idempotencyKey, MAX_APPROVAL_IDEMPOTENCY_KEY_LENGTH)) {
    return invalidInput("idempotencyKey", "Approval idempotency key is invalid.");
  }
  if (input.reason !== undefined && !isBoundedText(input.reason, MAX_APPROVAL_REASON_LENGTH)) {
    return invalidInput("reason", "Approval reason is invalid.");
  }
  if (input.decision !== ApprovalDecision.Approved && input.reason === undefined) {
    return invalidInput("reason", "Rejected or waived approval requires a reason.");
  }

  return success({
    decisionRequestId: decisionRequestId.value,
    decisionRequestDigest: decisionRequestDigest.value,
    idempotencyKey: input.idempotencyKey,
    actor: actor.value,
    decision: input.decision,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  });
}

function isApprovalDecision(value: unknown): value is ApprovalDecision {
  return Object.values(ApprovalDecision).some((decision) => decision === value);
}

function isBoundedText(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && value === value.trim();
}

function invalidInput(field: string, message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, { field }));
}
