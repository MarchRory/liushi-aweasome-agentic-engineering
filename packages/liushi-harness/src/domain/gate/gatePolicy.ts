import { ApprovalDecision, type ApprovalRecord } from "#domain/approval/index.js";
import { ArtifactStatus, ArtifactType, type SupportedArtifact } from "#domain/artifact/index.js";
import { GateEvaluationResult, GateId, RiskLevel } from "#domain/policy/index.js";

import type { GateEvaluation } from "./gateContracts.js";
import { GateReason } from "./gateReason.js";

/** 对 Artifact 与已持久化 Approval 执行确定性 Gate Evaluation。 */
export function evaluateArtifactGate(
  artifact: SupportedArtifact,
  approvals: readonly ApprovalRecord[],
  evaluatedAt: string,
): GateEvaluation {
  const riskLevel = resolveRiskLevel(artifact);
  const requiredGates = resolveRequiredGates(artifact);
  const base = {
    riskLevel,
    artifactId: artifact.artifactId,
    artifactDigest: artifact.digest,
    requiredGates,
    evidenceIds: resolveEvidenceIds(artifact),
    evaluatedAt,
  };

  if (artifact.status !== ArtifactStatus.Proposed) {
    return {
      ...base,
      result: GateEvaluationResult.Forbidden,
      satisfiedApprovals: [],
      reasons: [GateReason.ArtifactStatusNotProposed],
    };
  }
  if (riskLevel === RiskLevel.R4) {
    return {
      ...base,
      result: GateEvaluationResult.Forbidden,
      satisfiedApprovals: [],
      reasons: [GateReason.RiskLevelForbidden],
    };
  }
  if (requiredGates.length === 0) {
    return {
      ...base,
      result: GateEvaluationResult.Allow,
      satisfiedApprovals: [],
      reasons: [GateReason.ApprovalNotRequired],
    };
  }

  const satisfiedApprovals = requiredGates.flatMap((gate) => {
    const approval = approvals.find(
      (candidate) =>
        candidate.gate === gate &&
        candidate.artifactId === artifact.artifactId &&
        candidate.artifactDigest === artifact.digest &&
        candidate.decision === ApprovalDecision.Approved,
    );
    return approval === undefined ? [] : [approval.approvalId];
  });
  const allSatisfied = satisfiedApprovals.length === requiredGates.length;

  return {
    ...base,
    result: allSatisfied ? GateEvaluationResult.Allow : GateEvaluationResult.WaitingHuman,
    satisfiedApprovals,
    reasons: [
      allSatisfied ? GateReason.RequiredApprovalSatisfied : GateReason.RequiredApprovalMissing,
    ],
  };
}

function resolveRiskLevel(artifact: SupportedArtifact): RiskLevel {
  switch (artifact.artifactType) {
    case ArtifactType.RequirementContract:
      return RiskLevel.R1;
    case ArtifactType.BusinessLogicChangeContract:
      return RiskLevel.R3;
    case ArtifactType.PlanRisk:
      return artifact.payload.riskLevel;
    case ArtifactType.ProjectProfileProposal:
      return RiskLevel.R3;
  }
}

function resolveRequiredGates(artifact: SupportedArtifact): readonly GateId[] {
  switch (artifact.artifactType) {
    case ArtifactType.RequirementContract:
      return [GateId.G1Requirement];
    case ArtifactType.BusinessLogicChangeContract:
      return [GateId.G2BusinessLogic];
    case ArtifactType.PlanRisk:
      return artifact.payload.riskLevel === RiskLevel.R2 ||
        artifact.payload.riskLevel === RiskLevel.R3
        ? [GateId.G4RiskOperation]
        : [];
    case ArtifactType.ProjectProfileProposal:
      return [GateId.G8ProjectCompliance];
  }
}

function resolveEvidenceIds(artifact: SupportedArtifact): readonly string[] {
  switch (artifact.artifactType) {
    case ArtifactType.RequirementContract:
    case ArtifactType.BusinessLogicChangeContract:
      return artifact.payload.evidence.map((evidence) => evidence.evidenceId);
    case ArtifactType.PlanRisk:
    case ArtifactType.ProjectProfileProposal:
      return [];
  }
}
