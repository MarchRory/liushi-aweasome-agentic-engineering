import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { ApprovalDecision } from "#domain/approval/index.js";
import {
  ArtifactType,
  type ArtifactProposal,
  type SupportedArtifact,
} from "#domain/artifact/index.js";
import { TaskRunState } from "#domain/task/index.js";

import type { TaskAggregate } from "./contracts/index.js";
import { TaskCheckpoint } from "./enums/index.js";

/** 在创建 Artifact Event 前校验当前 Task 工作流是否允许该 Proposal。 */
export function validateArtifactProposalTransition(
  aggregate: TaskAggregate,
  proposal: ArtifactProposal,
): Result<void, HarnessError> {
  const revisionTarget = findRejectedArtifactRevisionTarget(aggregate, proposal);
  if (revisionTarget !== undefined) {
    return validateRevisionProposal(aggregate, proposal);
  }
  if (aggregate.pendingDecision !== undefined || aggregate.task.runState !== TaskRunState.Running) {
    return invalidTransition("Task is not active or already has a pending Human decision.");
  }
  if (aggregate.artifacts.some((artifact) => artifact.artifactType === proposal.artifactType)) {
    return invalidTransition("Only an explicitly rejected Artifact may be revised.");
  }

  switch (proposal.artifactType) {
    case ArtifactType.RequirementContract:
      return aggregate.checkpoint === TaskCheckpoint.TaskCreated ||
        aggregate.checkpoint === TaskCheckpoint.ProjectProfileApproved
        ? success(undefined)
        : invalidTransition("RequirementContract must be the first Task Artifact.");
    case ArtifactType.ProjectProfileProposal:
      return aggregate.checkpoint === TaskCheckpoint.TaskCreated
        ? success(undefined)
        : invalidTransition("ProjectProfileProposal must run before Task planning Artifacts.");
    case ArtifactType.BusinessLogicChangeContract:
      return aggregate.checkpoint === TaskCheckpoint.RequirementApproved
        ? success(undefined)
        : invalidTransition("BusinessLogicChangeContract requires approved Requirements.");
    case ArtifactType.PlanRisk:
      return validatePlanTransition(aggregate, proposal);
  }
}

/** 查找允许由新 Proposal 显式替代的已拒绝 Artifact Revision。 */
export function findRejectedArtifactRevisionTarget(
  aggregate: TaskAggregate,
  proposal: ArtifactProposal,
): SupportedArtifact | undefined {
  const pending = aggregate.pendingDecision;
  if (pending === undefined || aggregate.task.runState !== TaskRunState.WaitingHuman) {
    return undefined;
  }
  const rejected = aggregate.approvals.some(
    (approval) =>
      approval.decision === ApprovalDecision.Rejected &&
      approval.decisionRequestId === pending.decisionRequestId &&
      approval.decisionRequestDigest === pending.digest,
  );
  if (!rejected) {
    return undefined;
  }
  return aggregate.artifacts.find(
    (artifact) =>
      artifact.artifactId === pending.artifactId &&
      artifact.digest === pending.artifactDigest &&
      artifact.artifactType === proposal.artifactType,
  );
}

function validateRevisionProposal(
  aggregate: TaskAggregate,
  proposal: ArtifactProposal,
): Result<void, HarnessError> {
  if (proposal.artifactType === ArtifactType.PlanRisk) {
    return validateHistoricalPlanReference(aggregate, proposal);
  }
  return success(undefined);
}

function validatePlanTransition(
  aggregate: TaskAggregate,
  proposal: Extract<ArtifactProposal, { artifactType: ArtifactType.PlanRisk }>,
): Result<void, HarnessError> {
  const allowedCheckpoint = proposal.payload.historicalLogicChange
    ? aggregate.checkpoint === TaskCheckpoint.BusinessLogicApproved
    : aggregate.checkpoint === TaskCheckpoint.RequirementApproved ||
      aggregate.checkpoint === TaskCheckpoint.BusinessLogicApproved;
  if (!allowedCheckpoint) {
    return invalidTransition(
      proposal.payload.historicalLogicChange
        ? "Historical PlanRisk requires approved Business Logic."
        : "PlanRisk requires approved Requirements.",
    );
  }
  if (!proposal.payload.historicalLogicChange) {
    return success(undefined);
  }

  return validateHistoricalPlanReference(aggregate, proposal);
}

function validateHistoricalPlanReference(
  aggregate: TaskAggregate,
  proposal: Extract<ArtifactProposal, { artifactType: ArtifactType.PlanRisk }>,
): Result<void, HarnessError> {
  if (!proposal.payload.historicalLogicChange) {
    return success(undefined);
  }

  const referenced = aggregate.artifacts.find(
    (artifact) =>
      artifact.artifactType === ArtifactType.BusinessLogicChangeContract &&
      artifact.digest === proposal.payload.businessLogicArtifactDigest,
  );
  return referenced === undefined
    ? invalidTransition("PlanRisk references an unknown Business Logic Artifact Digest.")
    : success(undefined);
}

function invalidTransition(message: string): Result<void, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidStateTransition, message));
}
