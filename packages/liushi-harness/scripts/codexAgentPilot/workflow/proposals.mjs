import { ARTIFACT_TYPES, PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION } from "../constants/index.mjs";
import { createPublicCodexAgentPilotCase } from "../case/index.mjs";

export function createProjectProfileProposal(
  report,
  pilotCase = createPublicCodexAgentPilotCase(),
) {
  if (report?.workspaceId !== pilotCase.workspaceId) {
    throw new Error("扫描报告 workspaceId 与 Pilot Case 不一致。");
  }
  const candidate = report?.profileCandidates?.find(
    (entry) => entry.repositoryId === pilotCase.repository.id,
  );
  if (candidate === undefined) throw new Error("扫描报告缺少 Pilot 单仓候选。");
  if (candidate.repositoryRevision !== pilotCase.repository.revision)
    throw new Error("扫描报告 revision 与 Pilot Case 不一致。");
  if (candidate.roleHint !== pilotCase.repository.roleHint) {
    throw new Error("扫描报告 roleHint 与 Pilot Case 不一致。");
  }
  return {
    artifactType: ARTIFACT_TYPES.ProjectProfile,
    status: "proposed",
    payload: {
      schemaVersion: PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION,
      discoveryReportDigest: report.digest,
      workspaceGraphRevision: report.workspaceGraphRevision,
      repositorySelections: [
        {
          repositoryId: candidate.repositoryId,
          repositoryRevision: candidate.repositoryRevision,
          profileCandidateDigest: candidate.digest,
          confirmedRole: candidate.roleHint,
          acceptedRuleIds: candidate.ruleCandidates.map((rule) => rule.ruleId),
          rejectedRuleIds: [],
          acceptedMechanismCandidateIds: candidate.mechanismCandidates.map(
            (item) => item.candidateId,
          ),
          rejectedMechanismCandidateIds: [],
          verificationChecks: pilotCase.verificationChecks.map((check) => ({
            ...check,
            command: {
              ...check.command,
              args: [...check.command.args],
              allowedEnvironmentKeys: [...check.command.allowedEnvironmentKeys],
            },
            validatorIds: [...check.validatorIds],
          })),
        },
      ],
    },
  };
}

export function createRequirementProposal(pilotCase = createPublicCodexAgentPilotCase()) {
  return globalThis.structuredClone(pilotCase.requirementProposal);
}

export function createPlanRiskProposal(pilotCase = createPublicCodexAgentPilotCase()) {
  return globalThis.structuredClone(pilotCase.planRiskProposal);
}
