import {
  PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION,
  PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION,
  RULE_SCHEMA_VERSION,
  ResultStatus,
  type ContentDigest,
} from "../../../src/common/index.js";
import { parseApprovalId } from "../../../src/domain/approval/index.js";
import type { ProjectProfileProposalPayload } from "../../../src/domain/artifact/index.js";
import {
  PROJECT_SCANNER_VERSION,
  ProjectCandidateConfidence,
  ProjectDiscoveryStatus,
  ProjectMechanismKind,
  ProjectProfilePromotionStatus,
  RepositoryRole,
  createArchitectureMechanismCandidateDigestInput,
  createProjectDiscoveryReportDigestInput,
  createProjectProfileCandidateDigestInput,
  type ArchitectureMechanismCandidate,
  type ProjectDiscoveryReport,
  type ProjectProfileCandidate,
} from "../../../src/domain/projectDiscovery/index.js";
import {
  RuleScopeLevel,
  RuleSourceKind,
  RuleStatus,
  createRuleDigestInput,
  type RuleDefinition,
} from "../../../src/domain/rule/index.js";
import { parseTaskId } from "../../../src/domain/task/index.js";
import { parseRepositoryId, parseWorkspaceId } from "../../../src/domain/workspace/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../../src/infrastructure/index.js";
import { createRule, DIGEST } from "../rule/index.js";

export const compilerDigestPort = new Rfc8785Sha256DigestAdapter();
export const compilerWorkspaceId = unwrap(parseWorkspaceId("workspace-profile"));
export const compilerRepoA = unwrap(parseRepositoryId("repo-a"));
export const compilerRepoB = unwrap(parseRepositoryId("repo-b"));
export const compilerProvenance = {
  workspaceId: compilerWorkspaceId,
  taskId: unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FAW")),
  proposalArtifactDigest: `sha256:${"b".repeat(64)}` as ContentDigest,
  approvalId: unwrap(parseApprovalId("01ARZ3NDEKTSV4RRFFQ69G5FAV")),
  approvedAt: "2026-07-11T00:00:00.000Z",
};

/** 创建带稳定摘要的多仓发现报告。 */
export function createCompilerReport(
  candidates: readonly ProjectProfileCandidate[],
): ProjectDiscoveryReport {
  const report: ProjectDiscoveryReport = {
    schemaVersion: PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION,
    scannerVersion: PROJECT_SCANNER_VERSION,
    workspaceId: compilerWorkspaceId,
    workspaceGraphRevision: "graph-rev-1",
    status: ProjectDiscoveryStatus.Complete,
    profilePromotionStatus: ProjectProfilePromotionStatus.HumanReviewRequired,
    profileCandidates: candidates,
    dependencyEdges: [],
    dependencyAmbiguities: [],
    digest: DIGEST,
  };
  return withCompilerDigest(report, createProjectDiscoveryReportDigestInput(report));
}

/** 创建单仓候选及其 repository-scoped Rule。 */
export function createCompilerCandidate(
  repositoryId: typeof compilerRepoA,
): ProjectProfileCandidate {
  const rule = createCompilerRule(repositoryId);
  const mechanism = createCompilerMechanism(repositoryId);
  const candidate: ProjectProfileCandidate = {
    schemaVersion: PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION,
    repositoryId,
    repositoryRevision: `repo-rev-${repositoryId}`,
    roleHint: RepositoryRole.Application,
    status: ProjectDiscoveryStatus.Complete,
    inventory: { fileCount: 1, directoryCount: 1, skippedLinkCount: 0, ignoredDirectoryCount: 0 },
    languages: [{ languageId: "typescript", fileCount: 1 }],
    packageManagers: [],
    packages: [],
    compilerConfigs: [],
    frameworkHints: [],
    configFiles: [],
    mechanismCandidates: [mechanism],
    ruleCandidates: [rule],
    diagnostics: [],
    digest: DIGEST,
  };
  return withCompilerDigest(candidate, createProjectProfileCandidateDigestInput(candidate));
}

/** 创建覆盖报告全部仓候选的审批选择。 */
export function createCompilerProposal(
  report: ProjectDiscoveryReport,
  order: readonly ProjectProfileCandidate[] = report.profileCandidates,
): ProjectProfileProposalPayload {
  return {
    discoveryReportDigest: report.digest,
    workspaceGraphRevision: report.workspaceGraphRevision,
    repositorySelections: order.map((candidate) => ({
      repositoryId: candidate.repositoryId,
      repositoryRevision: candidate.repositoryRevision,
      profileCandidateDigest: candidate.digest,
      confirmedRole: RepositoryRole.Application,
      acceptedRuleIds: candidate.ruleCandidates.map((rule) => rule.ruleId),
      rejectedRuleIds: [],
      acceptedMechanismCandidateIds: candidate.mechanismCandidates.map((item) => item.candidateId),
      rejectedMechanismCandidateIds: [],
    })),
  };
}

/** 使用测试摘要端口重算值的摘要。 */
export function withCompilerDigest<T extends { digest: ContentDigest }>(
  value: T,
  input: unknown,
): T {
  const digest = compilerDigestPort.calculate(input);
  if (digest.status === ResultStatus.Failure) throw digest.error;
  return { ...value, digest: digest.value };
}

function createCompilerRule(repositoryId: typeof compilerRepoA): RuleDefinition {
  const rule = createRule({
    ruleId: `project.${repositoryId}.typescript.strict`,
    familyKey: "typescript.strict",
    status: RuleStatus.Candidate,
    schemaVersion: RULE_SCHEMA_VERSION,
    scope: { level: RuleScopeLevel.Repository, workspaceId: compilerWorkspaceId, repositoryId },
    selector: { repositoryIds: [repositoryId] },
    sourceRefs: [
      {
        kind: RuleSourceKind.ProjectFile,
        sourceId: "tsconfig.json",
        revision: `repo-rev-${repositoryId}`,
      },
    ],
  });
  return withCompilerDigest(rule, createRuleDigestInput(rule));
}

function createCompilerMechanism(
  repositoryId: typeof compilerRepoA,
): ArchitectureMechanismCandidate {
  const mechanism: ArchitectureMechanismCandidate = {
    schemaVersion: "1.0.0",
    candidateId: `mechanism.${repositoryId}`,
    repositoryId,
    kind: ProjectMechanismKind.SourceRoot,
    relativePath: "src",
    confidence: ProjectCandidateConfidence.StructuralHeuristic,
    rationale: "Source root found.",
    digest: DIGEST,
  };
  return withCompilerDigest(mechanism, createArchitectureMechanismCandidateDigestInput(mechanism));
}

function unwrap<T>(
  result:
    { status: ResultStatus.Success; value: T } | { status: ResultStatus.Failure; error: Error },
): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
