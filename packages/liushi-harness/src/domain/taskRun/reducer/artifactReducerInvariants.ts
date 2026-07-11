import { ApprovalDecision, type DecisionRequest } from "#domain/approval/index.js";
import { ArtifactType, type SupportedArtifact } from "#domain/artifact/index.js";
import { GateId } from "#domain/policy/index.js";
import { TaskRunState } from "#domain/task/index.js";

import type { TaskAggregate } from "../contracts/index.js";

/** 校验 Artifact 与当前 Task 的身份边界一致。 */
export function assertArtifactIdentity(
  aggregate: TaskAggregate,
  artifact: SupportedArtifact,
): void {
  if (
    artifact.taskId !== aggregate.task.taskId ||
    artifact.workspaceId !== aggregate.task.workspaceId
  ) {
    throw new Error("Artifact identity does not match Task.");
  }
}

/** 仅允许新 Artifact 显式修订当前已拒绝 DecisionRequest 的同类型 Revision。 */
export function assertArtifactCommitDecisionState(
  aggregate: TaskAggregate,
  artifact: SupportedArtifact,
): void {
  const pending = aggregate.pendingDecision;
  if (pending === undefined) {
    return;
  }
  const previous = aggregate.artifacts.find(
    (candidate) =>
      candidate.artifactId === pending.artifactId && candidate.digest === pending.artifactDigest,
  );
  const rejected = aggregate.approvals.some(
    (approval) =>
      approval.decision === ApprovalDecision.Rejected &&
      approval.decisionRequestId === pending.decisionRequestId &&
      approval.decisionRequestDigest === pending.digest,
  );
  if (
    aggregate.task.runState !== TaskRunState.WaitingHuman ||
    previous === undefined ||
    !rejected ||
    previous.artifactType !== artifact.artifactType
  ) {
    throw new Error("Task already has an unresolved DecisionRequest.");
  }
}

/** 校验同类型 Artifact 的 Revision 与 parentDigest 链。 */
export function assertArtifactRevision(
  artifacts: readonly SupportedArtifact[],
  artifact: SupportedArtifact,
): void {
  const revisions = artifacts.filter((item) => item.artifactType === artifact.artifactType);
  const previous = revisions.at(-1);
  if (previous === undefined) {
    if (artifact.revision !== 1 || artifact.parentDigest !== undefined) {
      throw new Error("First Artifact revision must be revision 1 without parentDigest.");
    }
    return;
  }
  if (
    artifact.artifactId !== previous.artifactId ||
    artifact.revision !== previous.revision + 1 ||
    artifact.parentDigest !== previous.digest
  ) {
    throw new Error("Artifact revision chain is invalid.");
  }
}

/** 校验 Requirement 与历史业务逻辑审批前置条件。 */
export function assertWorkflowPrerequisites(
  aggregate: TaskAggregate,
  artifact: SupportedArtifact,
): void {
  if (artifact.artifactType === ArtifactType.RequirementContract) {
    return;
  }
  const requirement = aggregate.artifacts.find(
    (item) => item.artifactType === ArtifactType.RequirementContract,
  );
  if (requirement === undefined || !hasApprovedGate(aggregate, requirement, GateId.G1Requirement)) {
    throw new Error("Planning Artifact requires an approved Requirement Contract.");
  }
  if (artifact.artifactType !== ArtifactType.PlanRisk || !artifact.payload.historicalLogicChange) {
    return;
  }
  const businessLogic = aggregate.artifacts.find(
    (item) =>
      item.artifactType === ArtifactType.BusinessLogicChangeContract &&
      item.digest === artifact.payload.businessLogicArtifactDigest,
  );
  if (
    businessLogic === undefined ||
    !hasApprovedGate(aggregate, businessLogic, GateId.G2BusinessLogic)
  ) {
    throw new Error("Historical PlanRisk requires an approved Business Logic Contract.");
  }
}

/** 校验 DecisionRequest 与 Artifact 及唯一阻断 Gate 精确绑定。 */
export function assertDecisionBinding(
  artifact: SupportedArtifact,
  requiredGates: readonly GateId[],
  decision: DecisionRequest,
): void {
  if (
    requiredGates.length !== 1 ||
    decision.gate !== requiredGates[0] ||
    decision.taskId !== artifact.taskId ||
    decision.artifactId !== artifact.artifactId ||
    decision.artifactDigest !== artifact.digest
  ) {
    throw new Error("DecisionRequest does not match Artifact Gate Evaluation.");
  }
}

function hasApprovedGate(
  aggregate: TaskAggregate,
  artifact: SupportedArtifact,
  gate: GateId,
): boolean {
  return aggregate.approvals.some(
    (approval) =>
      approval.decision === ApprovalDecision.Approved &&
      approval.gate === gate &&
      approval.artifactId === artifact.artifactId &&
      approval.artifactDigest === artifact.digest,
  );
}
