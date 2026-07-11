import { ActorKind } from "#common/index.js";
import {
  ApprovalDecision,
  type ApprovalRecord,
  type DecisionRequest,
} from "#domain/approval/index.js";
import type { SupportedArtifact } from "#domain/artifact/index.js";

import type { TaskAggregate } from "../contracts/index.js";

/** ApprovalReducer 完成校验后得到的精确目标。 */
export interface ApprovalReducerTarget {
  /** 当前唯一待处理的 DecisionRequest。 */
  pending: DecisionRequest;
  /** Approval 精确绑定的不可变 Artifact Revision。 */
  artifact: SupportedArtifact;
}

/** 校验 Approval 的 Human 身份、精确绑定、幂等性及单次决策不变量。 */
export function resolveApprovalReducerTarget(
  aggregate: TaskAggregate,
  approval: ApprovalRecord,
): ApprovalReducerTarget {
  const pending = aggregate.pendingDecision;
  if (pending === undefined) {
    throw new Error("ApprovalRecorded requires a pending DecisionRequest.");
  }
  if (
    approval.decisionRequestId !== pending.decisionRequestId ||
    approval.decisionRequestDigest !== pending.digest ||
    approval.gate !== pending.gate ||
    approval.artifactId !== pending.artifactId ||
    approval.artifactDigest !== pending.artifactDigest
  ) {
    throw new Error("ApprovalRecord does not match the pending DecisionRequest.");
  }
  if (approval.actor.kind !== ActorKind.Human) {
    throw new Error("ApprovalRecord must be created by a Human actor.");
  }
  if (approval.decision === ApprovalDecision.Waived) {
    throw new Error("G1, G2 and G4 cannot be waived.");
  }
  if (aggregate.approvals.some((item) => item.idempotencyKey === approval.idempotencyKey)) {
    throw new Error("Approval idempotency key already exists.");
  }
  if (aggregate.approvals.some((item) => item.decisionRequestId === approval.decisionRequestId)) {
    throw new Error("DecisionRequest already has a recorded Human decision.");
  }

  const artifact = aggregate.artifacts.find(
    (item) => item.artifactId === approval.artifactId && item.digest === approval.artifactDigest,
  );
  if (artifact === undefined) {
    throw new Error("ApprovalRecord references an unknown Artifact.");
  }
  return { pending, artifact };
}
