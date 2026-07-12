import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  RuleScopeLevel,
  createProjectDiscoveryReportDigestInput,
  createProjectProfileCandidateDigestInput,
  createRuleDigestInput,
  type ProjectDiscoveryReport,
  type ProjectProfileCandidate,
  type RuleDefinition,
} from "../../../src/index.js";
import { createReport, withDigest } from "../profileCompile/index.js";

/** Profile CLI E2E 使用的提案及报告文件。 */
export interface ProfileCliDocuments {
  /** ProjectProfileProposal JSON 路径。 */
  proposalFile: string;
  /** ProjectDiscoveryReport JSON 路径。 */
  reportFile: string;
  /** 严格领域报告夹具。 */
  report: ProjectDiscoveryReport;
}

/** 创建可通过真实 Artifact Proposal Schema 的 Profile CLI 输入文件。 */
export async function writeProfileCliDocuments(
  storeRoot: string,
  report: ProjectDiscoveryReport = createProfileCliReport(),
): Promise<ProfileCliDocuments> {
  const proposalFile = resolve(storeRoot, "profile-proposal.json");
  const reportFile = resolve(storeRoot, "project-discovery-report.json");
  await Promise.all([
    writeFile(proposalFile, JSON.stringify(createProfileProposal(report)), "utf8"),
    writeFile(reportFile, JSON.stringify(report), "utf8"),
  ]);
  return { proposalFile, reportFile, report };
}

function createProfileCliReport(): ProjectDiscoveryReport {
  const report = createReport();
  const candidate = report.profileCandidates[0];
  const rule = candidate?.ruleCandidates[0];
  if (candidate === undefined || rule === undefined) {
    throw new Error("Profile CLI fixture requires one rule candidate.");
  }
  const scopedRuleWithoutDigest: RuleDefinition = {
    ...rule,
    scope: { level: RuleScopeLevel.Workspace, workspaceId: report.workspaceId },
  };
  const scopedRule = withDigest(
    scopedRuleWithoutDigest,
    createRuleDigestInput(scopedRuleWithoutDigest),
  );
  const candidateWithoutDigest: ProjectProfileCandidate = {
    ...candidate,
    ruleCandidates: [scopedRule],
  };
  const scopedCandidate = withDigest(
    candidateWithoutDigest,
    createProjectProfileCandidateDigestInput(candidateWithoutDigest),
  );
  const reportWithoutDigest: ProjectDiscoveryReport = {
    ...report,
    profileCandidates: [scopedCandidate],
  };
  return withDigest(
    reportWithoutDigest,
    createProjectDiscoveryReportDigestInput(reportWithoutDigest),
  );
}

/** 覆盖报告文件，以便验证 CLI reader 的 fail-closed 行为。 */
export async function overwriteProfileReport(reportFile: string, report: unknown): Promise<void> {
  await writeFile(reportFile, JSON.stringify(report), "utf8");
}

function createProfileProposal(report: ProjectDiscoveryReport): object {
  const candidate = report.profileCandidates[0];
  if (candidate === undefined) {
    throw new Error("Profile CLI fixture requires one candidate.");
  }
  return {
    artifactType: "project_profile_proposal",
    status: "proposed",
    payload: {
      discoveryReportDigest: report.digest,
      workspaceGraphRevision: report.workspaceGraphRevision,
      repositorySelections: [
        {
          repositoryId: candidate.repositoryId,
          repositoryRevision: candidate.repositoryRevision,
          profileCandidateDigest: candidate.digest,
          confirmedRole: "application",
          acceptedRuleIds: candidate.ruleCandidates.map((rule) => rule.ruleId),
          rejectedRuleIds: [],
          acceptedMechanismCandidateIds: candidate.mechanismCandidates.map(
            (mechanism) => mechanism.candidateId,
          ),
          rejectedMechanismCandidateIds: [],
        },
      ],
    },
  };
}
