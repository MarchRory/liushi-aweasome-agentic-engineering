import {
  ActorKind,
  ApprovalDecision,
  ArtifactStatus,
  ArtifactType,
  GateId,
  TaskCheckpoint,
  TaskEventType,
  TaskPhase,
  TaskRunEventType,
  TaskRunState,
  type RequirementContractProposal,
  type TaskAggregateRecord,
  type TaskRunEventRecord,
} from "../../../src/index.js";

export const workflowMigrationIds = {
  taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  eventIds: [
    "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    "01ARZ3NDEKTSV4RRFFQ69G5FAX",
    "01ARZ3NDEKTSV4RRFFQ69G5FAY",
    "01ARZ3NDEKTSV4RRFFQ69G5FAZ",
  ],
  artifactIds: ["01ARZ3NDEKTSV4RRFFQ69G5FB0", "01ARZ3NDEKTSV4RRFFQ69G5FB1"],
  decisionRequestIds: ["01ARZ3NDEKTSV4RRFFQ69G5FC0", "01ARZ3NDEKTSV4RRFFQ69G5FC1"],
  approvalIds: ["01ARZ3NDEKTSV4RRFFQ69G5FD0", "01ARZ3NDEKTSV4RRFFQ69G5FD1"],
} as const;

export const workflowMigrationContext = {
  workspaceId: "workspace-a",
  occurredAt: "2026-07-11T00:00:00.000Z",
  actor: { kind: ActorKind.Human, actorId: "workflow-migration-fixture" },
} as const;

// V1 Golden Stream 只冻结公开 API 可观察到的事件顺序与关键语义。
export const approvedRequirementGoldenStream = {
  name: "create-requirement-approval",
  expectedEventTypes: [
    TaskEventType.TaskCreated,
    TaskRunEventType.ArtifactCommitted,
    TaskRunEventType.ApprovalRecorded,
  ],
  expectedCheckpoint: TaskCheckpoint.RequirementApproved,
  expectedTask: {
    phase: TaskPhase.Planning,
    runState: TaskRunState.Running,
  },
  expectedGate: GateId.G1Requirement,
  expectedDecision: ApprovalDecision.Approved,
  expectedArtifactRevision: 1,
} as const;

export const rejectedRequirementRevisionGoldenStream = {
  name: "reject-requirement-new-revision",
  expectedEventTypes: [
    TaskEventType.TaskCreated,
    TaskRunEventType.ArtifactCommitted,
    TaskRunEventType.ApprovalRecorded,
    TaskRunEventType.ArtifactCommitted,
  ],
  expectedCheckpoint: TaskCheckpoint.RequirementProposed,
  expectedTask: {
    phase: TaskPhase.Requirements,
    runState: TaskRunState.WaitingHuman,
  },
  expectedGate: GateId.G1Requirement,
  expectedDecision: ApprovalDecision.Rejected,
  expectedArtifactRevisions: [1, 2],
} as const;

export function requirementProposal(problem: string): RequirementContractProposal {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem,
      goals: ["Persist approval decisions with exact digest binding."],
      nonGoals: ["Implement Workflow V2 migration."],
      observableBehaviors: ["Replay reconstructs the V1 requirement gate state."],
      acceptanceCriteria: ["A human approval resumes the task."],
      includedScopes: ["packages/liushi-harness"],
      forbiddenScopes: ["unrelated packages"],
      repositories: ["liushi-aweasome-agentic-engineering"],
      edgeCases: ["A rejected artifact creates the next revision."],
      compatibilityConstraints: ["The append-only event log remains authoritative."],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

/** V1 Replay 迁移时需要逐字段保持一致的语义摘要。 */
export type WorkflowMigrationSemanticSummary = {
  task: {
    phase: string;
    runState: string;
    source?: string;
  };
  checkpoint: string;
  pendingDecision?: {
    gate: string;
    artifactId: string;
    artifactDigest: string;
    resumeCheckpoint: string;
  };
  artifacts: Array<{
    artifactType: string;
    status: string;
    artifactId: string;
    revision: number;
    parentDigest?: string;
    digest: string;
  }>;
  approvals: Array<{
    decision: string;
    gate: string;
    artifactId: string;
    artifactDigest: string;
    decisionRequestId: string;
    reason?: string;
  }>;
};

export function summarizeWorkflowMigrationAggregate(
  record: TaskAggregateRecord,
): WorkflowMigrationSemanticSummary {
  return {
    task: {
      phase: record.aggregate.task.phase,
      runState: record.aggregate.task.runState,
      ...(record.aggregate.task.source === undefined
        ? {}
        : { source: record.aggregate.task.source }),
    },
    checkpoint: record.aggregate.checkpoint,
    ...(record.aggregate.pendingDecision === undefined
      ? {}
      : {
          pendingDecision: {
            gate: record.aggregate.pendingDecision.gate,
            artifactId: record.aggregate.pendingDecision.artifactId,
            artifactDigest: record.aggregate.pendingDecision.artifactDigest,
            resumeCheckpoint: record.aggregate.pendingDecision.resumeCheckpoint,
          },
        }),
    artifacts: record.aggregate.artifacts.map((artifact) => ({
      artifactType: artifact.artifactType,
      status: artifact.status,
      artifactId: artifact.artifactId,
      revision: artifact.revision,
      ...(artifact.parentDigest === undefined ? {} : { parentDigest: artifact.parentDigest }),
      digest: artifact.digest,
    })),
    approvals: record.aggregate.approvals.map((approval) => ({
      decision: approval.decision,
      gate: approval.gate,
      artifactId: approval.artifactId,
      artifactDigest: approval.artifactDigest,
      decisionRequestId: approval.decisionRequestId,
      ...(approval.reason === undefined ? {} : { reason: approval.reason }),
    })),
  };
}

export function eventTypes(events: readonly TaskRunEventRecord[]): readonly string[] {
  return events.map((event) => event.type);
}
