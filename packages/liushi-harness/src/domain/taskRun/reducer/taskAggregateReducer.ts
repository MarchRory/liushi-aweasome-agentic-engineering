import { ApprovalDecision } from "#domain/approval/index.js";
import { evaluateArtifactGate } from "#domain/gate/index.js";
import { GateEvaluationResult } from "#domain/policy/index.js";
import type { TaskState } from "#domain/task/index.js";

import type {
  ApprovalRecordedEventRecord,
  ArtifactCommittedEventRecord,
  TaskAggregate,
} from "../contracts/index.js";
import { TaskCheckpoint } from "../enums/index.js";
import {
  assertArtifactIdentity,
  assertArtifactRevision,
  assertArtifactCommitDecisionState,
  assertDecisionBinding,
  assertWorkflowPrerequisites,
} from "./artifactReducerInvariants.js";
import { resolveApprovalReducerTarget } from "./approvalReducerInvariants.js";
import { gateEvaluationsEqual } from "./gateEvaluationEquality.js";
import {
  allowedCheckpoint,
  approvedCheckpoint,
  moveTaskAfterAllowedArtifact,
  moveTaskToWaitingHuman,
  proposedCheckpoint,
  resumeTaskAfterApproval,
} from "./taskAggregateTransitions.js";

/** 从 TaskCreated State 建立空的 Task 运行聚合。 */
export function createInitialTaskAggregate(task: TaskState): TaskAggregate {
  return {
    task,
    checkpoint: TaskCheckpoint.TaskCreated,
    artifacts: [],
    approvals: [],
  };
}

/** 将已校验的 ArtifactCommitted Event 应用到 Task Aggregate。 */
export function applyArtifactCommitted(
  aggregate: TaskAggregate,
  event: ArtifactCommittedEventRecord,
): TaskAggregate {
  const { artifact, gateEvaluation, decisionRequest } = event.payload;
  assertArtifactIdentity(aggregate, artifact);
  assertArtifactCommitDecisionState(aggregate, artifact);
  assertArtifactRevision(aggregate.artifacts, artifact);

  const expectedEvaluation = evaluateArtifactGate(
    artifact,
    aggregate.approvals,
    gateEvaluation.evaluatedAt,
  );
  if (!gateEvaluationsEqual(gateEvaluation, expectedEvaluation)) {
    throw new Error("ArtifactCommitted Gate Evaluation does not match deterministic policy.");
  }
  if (gateEvaluation.result === GateEvaluationResult.Forbidden) {
    throw new Error("Forbidden Artifact cannot be committed.");
  }
  assertWorkflowPrerequisites(aggregate, artifact);

  const artifacts = [...aggregate.artifacts, artifact];
  if (gateEvaluation.result === GateEvaluationResult.WaitingHuman) {
    if (decisionRequest === undefined) {
      throw new Error("WaitingHuman Artifact requires a DecisionRequest.");
    }
    assertDecisionBinding(artifact, gateEvaluation.requiredGates, decisionRequest);
    return {
      task: moveTaskToWaitingHuman(aggregate.task, artifact, event.occurredAt),
      checkpoint: proposedCheckpoint(artifact),
      pendingDecision: decisionRequest,
      artifacts,
      approvals: aggregate.approvals,
    };
  }
  if (decisionRequest !== undefined) {
    throw new Error("Allowed Artifact must not create a DecisionRequest.");
  }

  return {
    task: moveTaskAfterAllowedArtifact(aggregate.task, artifact, event.occurredAt),
    checkpoint: allowedCheckpoint(artifact),
    artifacts,
    approvals: aggregate.approvals,
  };
}

/** 将已校验的 ApprovalRecorded Event 应用到 Task Aggregate。 */
export function applyApprovalRecorded(
  aggregate: TaskAggregate,
  event: ApprovalRecordedEventRecord,
): TaskAggregate {
  const approval = event.payload.approval;
  const target = resolveApprovalReducerTarget(aggregate, approval);
  const approvals = [...aggregate.approvals, approval];
  const expectedEvaluation = evaluateArtifactGate(
    target.artifact,
    approvals,
    event.payload.gateEvaluation.evaluatedAt,
  );
  if (!gateEvaluationsEqual(event.payload.gateEvaluation, expectedEvaluation)) {
    throw new Error("ApprovalRecorded Gate Evaluation does not match deterministic policy.");
  }

  if (approval.decision === ApprovalDecision.Rejected) {
    return { ...aggregate, approvals };
  }
  if (expectedEvaluation.result !== GateEvaluationResult.Allow) {
    throw new Error("Approved decision did not satisfy the pending Gate.");
  }

  return {
    task: resumeTaskAfterApproval(aggregate.task, target.pending.gate, event.occurredAt),
    checkpoint: approvedCheckpoint(target.pending.gate),
    artifacts: aggregate.artifacts,
    approvals,
  };
}
