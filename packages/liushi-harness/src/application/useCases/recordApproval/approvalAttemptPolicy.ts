import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ApprovalDecision,
  type ApprovalRecord,
  type DecisionRequest,
} from "#domain/approval/index.js";
import type { SupportedArtifact } from "#domain/artifact/index.js";
import type { TaskAggregate } from "#domain/taskRun/index.js";

import type { ApprovalSubmission } from "./approvalSubmission.js";

/** 待审批 DecisionRequest 及其不可变 Artifact。 */
export interface ApprovalTarget {
  /** 当前唯一待处理的 DecisionRequest。 */
  decisionRequest: DecisionRequest;
  /** DecisionRequest 精确绑定的 Artifact Revision。 */
  artifact: SupportedArtifact;
}

/** 按幂等键查找已经持久化的 ApprovalRecord。 */
export function findApprovalByIdempotencyKey(
  aggregate: TaskAggregate,
  idempotencyKey: string,
): ApprovalRecord | undefined {
  return aggregate.approvals.find((approval) => approval.idempotencyKey === idempotencyKey);
}

/** 确认同一幂等键代表完全相同的 Human 决策，并返回其 Artifact。 */
export function validateApprovalReuse(
  aggregate: TaskAggregate,
  approval: ApprovalRecord,
  submission: ApprovalSubmission,
): Result<SupportedArtifact, HarnessError> {
  if (!approvalMatchesSubmission(approval, submission)) {
    return failure(
      new HarnessError(
        HarnessErrorCode.DecisionConflict,
        "Approval idempotency key is already bound to a different decision.",
        { idempotencyKey: submission.idempotencyKey },
      ),
    );
  }
  return findBoundArtifact(aggregate, approval.artifactId, approval.artifactDigest);
}

/** 校验当前聚合允许记录该 Human 决策，并解析精确审批目标。 */
export function resolveApprovalTarget(
  aggregate: TaskAggregate,
  submission: ApprovalSubmission,
): Result<ApprovalTarget, HarnessError> {
  const pending = aggregate.pendingDecision;
  if (pending === undefined) {
    const wasRecorded = aggregate.approvals.some(
      (approval) => approval.decisionRequestId === submission.decisionRequestId,
    );
    return failure(
      new HarnessError(
        wasRecorded ? HarnessErrorCode.DecisionConflict : HarnessErrorCode.InvalidStateTransition,
        wasRecorded
          ? "DecisionRequest has already been resolved."
          : "Task does not have a pending DecisionRequest.",
      ),
    );
  }
  if (
    pending.decisionRequestId !== submission.decisionRequestId ||
    pending.digest !== submission.decisionRequestDigest
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.DecisionConflict,
        "Approval does not match the current DecisionRequest ID and Digest.",
      ),
    );
  }
  if (
    aggregate.approvals.some((approval) => approval.decisionRequestId === pending.decisionRequestId)
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.DecisionConflict,
        "DecisionRequest already has a recorded Human decision and must be revised explicitly.",
      ),
    );
  }
  if (submission.decision === ApprovalDecision.Waived) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "G1, G2 and G4 Human Gates cannot be waived.",
        { gate: pending.gate },
      ),
    );
  }

  const artifact = findBoundArtifact(aggregate, pending.artifactId, pending.artifactDigest);
  return artifact.status === ResultStatus.Failure
    ? artifact
    : success({ decisionRequest: pending, artifact: artifact.value });
}

function findBoundArtifact(
  aggregate: TaskAggregate,
  artifactId: ApprovalRecord["artifactId"],
  artifactDigest: ApprovalRecord["artifactDigest"],
): Result<SupportedArtifact, HarnessError> {
  const artifact = aggregate.artifacts.find(
    (candidate) => candidate.artifactId === artifactId && candidate.digest === artifactDigest,
  );
  return artifact === undefined
    ? failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "Decision references an unknown Artifact revision.",
        ),
      )
    : success(artifact);
}

function approvalMatchesSubmission(
  approval: ApprovalRecord,
  submission: ApprovalSubmission,
): boolean {
  return (
    approval.decisionRequestId === submission.decisionRequestId &&
    approval.decisionRequestDigest === submission.decisionRequestDigest &&
    approval.idempotencyKey === submission.idempotencyKey &&
    approval.actor.kind === submission.actor.kind &&
    approval.actor.actorId === submission.actor.actorId &&
    approval.decision === submission.decision &&
    approval.reason === submission.reason
  );
}
