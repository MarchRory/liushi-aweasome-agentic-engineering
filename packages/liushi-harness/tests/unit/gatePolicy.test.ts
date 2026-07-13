import { describe, expect, it } from "vitest";

import {
  APPROVAL_RECORD_SCHEMA_VERSION,
  ARTIFACT_SCHEMA_VERSION,
  PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION,
  ActorKind,
  ResultStatus,
} from "../../src/common/index.js";
import {
  ApprovalDecision,
  parseApprovalId,
  parseDecisionRequestId,
  type ApprovalRecord,
} from "../../src/domain/approval/index.js";
import {
  ArtifactStatus,
  ArtifactType,
  parseArtifactDigest,
  parseArtifactId,
  type PlanRiskArtifact,
  type ProjectProfileProposalArtifact,
  type RequirementContractArtifact,
  type SupportedArtifact,
} from "../../src/domain/artifact/index.js";
import { ClaimClassification, EvidenceKind } from "../../src/domain/evidence/index.js";
import {
  GateEvaluationResult,
  GateId,
  GateReason,
  RiskLevel,
  evaluateArtifactGate,
} from "../../src/domain/gate/index.js";
import { RepositoryRole } from "../../src/domain/projectDiscovery/index.js";
import { parseTaskId } from "../../src/domain/task/index.js";
import {
  VerificationKind,
  VerificationRequirement,
  VerificationSelectionMode,
} from "../../src/domain/verification/index.js";
import { parseRepositoryId, parseWorkspaceId } from "../../src/domain/workspace/index.js";

const ARTIFACT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const APPROVAL_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const DECISION_REQUEST_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAX";
const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAY";
const WORKSPACE_ID = "workspace-a";
const CREATED_AT = "2026-07-11T00:00:00.000Z";
const ARTIFACT_DIGEST = `sha256:${"a".repeat(64)}`;
const OTHER_DIGEST = `sha256:${"b".repeat(64)}`;
const DECISION_DIGEST = `sha256:${"c".repeat(64)}`;
const APPROVAL_DIGEST = `sha256:${"d".repeat(64)}`;

describe("deterministic Artifact Gate Policy", () => {
  it("Requirement 没有 Approval 时等待 G1 Human Gate", () => {
    const evaluation = evaluateArtifactGate(createRequirementArtifact(), [], CREATED_AT);

    expect(evaluation).toMatchObject({
      result: GateEvaluationResult.WaitingHuman,
      riskLevel: RiskLevel.R1,
      requiredGates: [GateId.G1Requirement],
      satisfiedApprovals: [],
      reasons: [GateReason.RequiredApprovalMissing],
    });
  });

  it("精确绑定 Artifact ID、Digest 与 Gate 的 Approval 允许继续", () => {
    const artifact = createRequirementArtifact();
    const approval = createApproval(artifact, ApprovalDecision.Approved);

    const evaluation = evaluateArtifactGate(artifact, [approval], CREATED_AT);

    expect(evaluation.result).toBe(GateEvaluationResult.Allow);
    expect(evaluation.satisfiedApprovals).toEqual([approval.approvalId]);
    expect(evaluation.reasons).toEqual([GateReason.RequiredApprovalSatisfied]);
  });

  it("旧 Digest、Rejected 与 Waived 都不能满足 G1", () => {
    const artifact = createRequirementArtifact();
    const staleApproval = {
      ...createApproval(artifact, ApprovalDecision.Approved),
      artifactDigest: parseDigest(OTHER_DIGEST),
    };
    const rejected = createApproval(artifact, ApprovalDecision.Rejected);
    const waived = createApproval(artifact, ApprovalDecision.Waived);

    const evaluation = evaluateArtifactGate(
      artifact,
      [staleApproval, rejected, waived],
      CREATED_AT,
    );

    expect(evaluation.result).toBe(GateEvaluationResult.WaitingHuman);
    expect(evaluation.satisfiedApprovals).toEqual([]);
  });

  it("R1 Plan 不信任 Proposal 自报 Gate，并允许无审批推进", () => {
    const artifact = createPlanRiskArtifact(RiskLevel.R1, [GateId.G1Requirement]);

    const evaluation = evaluateArtifactGate(artifact, [], CREATED_AT);

    expect(evaluation.result).toBe(GateEvaluationResult.Allow);
    expect(evaluation.requiredGates).toEqual([]);
    expect(evaluation.reasons).toEqual([GateReason.ApprovalNotRequired]);
  });

  it("R2/R3 Plan 要求 G4，R4 始终 Forbidden", () => {
    const r2 = evaluateArtifactGate(createPlanRiskArtifact(RiskLevel.R2), [], CREATED_AT);
    const r3 = evaluateArtifactGate(createPlanRiskArtifact(RiskLevel.R3), [], CREATED_AT);
    const r4 = evaluateArtifactGate(createPlanRiskArtifact(RiskLevel.R4), [], CREATED_AT);

    expect(r2).toMatchObject({
      result: GateEvaluationResult.WaitingHuman,
      requiredGates: [GateId.G4RiskOperation],
    });
    expect(r3).toMatchObject({
      result: GateEvaluationResult.WaitingHuman,
      requiredGates: [GateId.G4RiskOperation],
    });
    expect(r4).toMatchObject({
      result: GateEvaluationResult.Forbidden,
      reasons: [GateReason.RiskLevelForbidden],
    });
  });

  it("ProjectProfileProposal requires G8 human approval at R3", () => {
    const artifact = createProjectProfileProposalArtifact();

    const evaluation = evaluateArtifactGate(artifact, [], CREATED_AT);

    expect(evaluation).toMatchObject({
      result: GateEvaluationResult.WaitingHuman,
      riskLevel: RiskLevel.R3,
      requiredGates: [GateId.G8ProjectCompliance],
      evidenceIds: [],
      satisfiedApprovals: [],
      reasons: [GateReason.RequiredApprovalMissing],
    });
  });

  it("ProjectProfileProposal allows after matching G8 approval", () => {
    const artifact = createProjectProfileProposalArtifact();
    const approval = createApproval(
      artifact,
      ApprovalDecision.Approved,
      GateId.G8ProjectCompliance,
    );

    const evaluation = evaluateArtifactGate(artifact, [approval], CREATED_AT);

    expect(evaluation.result).toBe(GateEvaluationResult.Allow);
    expect(evaluation.satisfiedApprovals).toEqual([approval.approvalId]);
    expect(evaluation.reasons).toEqual([GateReason.RequiredApprovalSatisfied]);
  });

  it("相同显式输入产生完全相同的 Evaluation", () => {
    const artifact = createRequirementArtifact();
    const approval = createApproval(artifact, ApprovalDecision.Approved);

    expect(evaluateArtifactGate(artifact, [approval], CREATED_AT)).toEqual(
      evaluateArtifactGate(artifact, [approval], CREATED_AT),
    );
  });
});

function createRequirementArtifact(): RequirementContractArtifact {
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    artifactId: parseArtifactIdentifier(),
    artifactType: ArtifactType.RequirementContract,
    workspaceId: parseWorkspace(),
    taskId: parseTask(),
    revision: 1,
    status: ArtifactStatus.Proposed,
    createdAt: CREATED_AT,
    createdBy: { kind: ActorKind.Agent, actorId: "requirements-agent" },
    digest: parseDigest(ARTIFACT_DIGEST),
    payload: {
      problem: "建立需求契约",
      goals: ["确认范围"],
      nonGoals: ["不写业务代码"],
      observableBehaviors: ["等待 G1"],
      acceptanceCriteria: ["Digest 审批后继续"],
      includedScopes: ["domain"],
      forbiddenScopes: ["release"],
      repositories: ["liushi-harness"],
      edgeCases: [],
      compatibilityConstraints: [],
      evidence: [
        {
          evidenceId: "ev-1",
          kind: EvidenceKind.Human,
          source: "human",
          title: "需求确认",
        },
      ],
      claims: [
        {
          claimId: "claim-1",
          statement: "需求需要 Human 确认",
          classification: ClaimClassification.Fact,
          evidenceIds: ["ev-1"],
        },
      ],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

function createPlanRiskArtifact(
  riskLevel: RiskLevel,
  proposedGates: readonly GateId[] = [],
): PlanRiskArtifact {
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    artifactId: parseArtifactIdentifier(),
    artifactType: ArtifactType.PlanRisk,
    workspaceId: parseWorkspace(),
    taskId: parseTask(),
    revision: 1,
    status: ArtifactStatus.Proposed,
    createdAt: CREATED_AT,
    createdBy: { kind: ActorKind.Agent, actorId: "planner" },
    digest: parseDigest(ARTIFACT_DIGEST),
    payload: {
      steps: [{ order: 1, action: "实现" }],
      readSet: ["src"],
      writeSet: ["src/domain"],
      risks: [],
      riskLevel,
      historicalLogicChange: false,
      riskOperations: [],
      testPlan: ["unit"],
      rollbackPlan: ["revert"],
      requiredGates: proposedGates,
    },
  };
}

function createProjectProfileProposalArtifact(): ProjectProfileProposalArtifact {
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    artifactId: parseArtifactIdentifier(),
    artifactType: ArtifactType.ProjectProfileProposal,
    workspaceId: parseWorkspace(),
    taskId: parseTask(),
    revision: 1,
    status: ArtifactStatus.Proposed,
    createdAt: CREATED_AT,
    createdBy: { kind: ActorKind.Agent, actorId: "profile-promoter" },
    digest: parseDigest(ARTIFACT_DIGEST),
    payload: {
      schemaVersion: PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION,
      discoveryReportDigest: parseDigest(OTHER_DIGEST),
      workspaceGraphRevision: "graph-rev-1",
      repositorySelections: [
        {
          repositoryId: parseRepositoryIdentifier("repo-a"),
          repositoryRevision: "repo-rev-1",
          profileCandidateDigest: parseDigest(DECISION_DIGEST),
          confirmedRole: RepositoryRole.Application,
          acceptedRuleIds: ["rule-a"],
          rejectedRuleIds: ["rule-b"],
          acceptedMechanismCandidateIds: ["mechanism-a"],
          rejectedMechanismCandidateIds: ["mechanism-b"],
          verificationChecks: [
            {
              checkId: "project.typecheck",
              kind: VerificationKind.Typecheck,
              requirement: VerificationRequirement.Required,
              command: {
                executable: "corepack",
                args: ["pnpm", "typecheck"],
                workingDirectory: "",
                allowedEnvironmentKeys: ["CI", "PATH"],
              },
              timeoutMs: 120_000,
              retryable: false,
              selectionMode: VerificationSelectionMode.Always,
              validatorIds: ["typescript.typecheck"],
            },
          ],
        },
      ],
    },
  };
}

function createApproval(
  artifact: SupportedArtifact,
  decision: ApprovalDecision,
  gate: GateId = GateId.G1Requirement,
): ApprovalRecord {
  const approvalId = parseApprovalId(APPROVAL_ID);
  const decisionRequestId = parseDecisionRequestId(DECISION_REQUEST_ID);
  if (approvalId.status === ResultStatus.Failure) {
    throw approvalId.error;
  }
  if (decisionRequestId.status === ResultStatus.Failure) {
    throw decisionRequestId.error;
  }

  return {
    schemaVersion: APPROVAL_RECORD_SCHEMA_VERSION,
    approvalId: approvalId.value,
    decisionRequestId: decisionRequestId.value,
    decisionRequestDigest: parseDigest(DECISION_DIGEST),
    gate,
    artifactId: artifact.artifactId,
    artifactDigest: artifact.digest,
    idempotencyKey: "approval-key",
    actor: { kind: ActorKind.Human, actorId: "reviewer" },
    decision,
    createdAt: CREATED_AT,
    digest: parseDigest(APPROVAL_DIGEST),
  };
}

function parseRepositoryIdentifier(value: string) {
  const result = parseRepositoryId(value);
  if (result.status === ResultStatus.Failure) {
    throw result.error;
  }
  return result.value;
}

function parseArtifactIdentifier() {
  const result = parseArtifactId(ARTIFACT_ID);
  if (result.status === ResultStatus.Failure) {
    throw result.error;
  }
  return result.value;
}

function parseDigest(value: string) {
  const result = parseArtifactDigest(value);
  if (result.status === ResultStatus.Failure) {
    throw result.error;
  }
  return result.value;
}

function parseTask() {
  const result = parseTaskId(TASK_ID);
  if (result.status === ResultStatus.Failure) {
    throw result.error;
  }
  return result.value;
}

function parseWorkspace() {
  const result = parseWorkspaceId(WORKSPACE_ID);
  if (result.status === ResultStatus.Failure) {
    throw result.error;
  }
  return result.value;
}
