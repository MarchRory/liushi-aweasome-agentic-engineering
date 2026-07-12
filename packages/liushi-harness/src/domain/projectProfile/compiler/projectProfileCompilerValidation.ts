import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import type { ProjectProfileProposalPayload } from "#domain/artifact/index.js";
import {
  createArchitectureMechanismCandidateDigestInput,
  createProjectDiscoveryReportDigestInput,
  createProjectProfileCandidateDigestInput,
  ProjectDiscoveryStatus,
  ProjectProfilePromotionStatus,
  type ProjectDiscoveryReport,
  type ProjectProfileCandidate,
} from "#domain/projectDiscovery/index.js";
import {
  createRuleDigestInput,
  RuleScopeLevel,
  RuleStatus,
  type RuleDefinition,
} from "#domain/rule/index.js";

import type {
  ProjectProfileCompilerProvenance,
  ProjectProfileDigestPort,
} from "../contracts/index.js";
import {
  expectDigest,
  expectSameSet,
  fail,
  validateReportRepositoryGraph,
} from "./projectProfileCompilerSupport.js";

/** 校验报告状态、来源身份、图引用与摘要。 */
export function validateReport(
  report: ProjectDiscoveryReport,
  proposal: ProjectProfileProposalPayload,
  provenance: ProjectProfileCompilerProvenance,
  digestPort: ProjectProfileDigestPort,
): Result<void, HarnessError> {
  if (report.workspaceId !== provenance.workspaceId) {
    return fail("Compiler provenance workspace does not match the report.");
  }
  if (report.status !== ProjectDiscoveryStatus.Complete) {
    return fail("Project discovery report must be complete.", { status: report.status });
  }
  if (report.profilePromotionStatus !== ProjectProfilePromotionStatus.HumanReviewRequired) {
    return fail("Project profile promotion must require human review.");
  }
  if (proposal.discoveryReportDigest !== report.digest) {
    return fail("Proposal discovery report digest drifted.");
  }
  if (proposal.workspaceGraphRevision !== report.workspaceGraphRevision) {
    return fail("Proposal workspace graph revision drifted.");
  }
  const graphCheck = validateReportRepositoryGraph(report);
  if (graphCheck.status === ResultStatus.Failure) return graphCheck;
  return expectDigest(
    digestPort,
    createProjectDiscoveryReportDigestInput(report),
    report.digest,
    "Project discovery report digest drifted.",
  );
}

/** 建立候选仓索引并拒绝大小写折叠后的重复仓身份。 */
export function indexCandidates(
  candidates: readonly ProjectProfileCandidate[],
): Result<ReadonlyMap<string, ProjectProfileCandidate>, HarnessError> {
  const indexed = new Map<string, ProjectProfileCandidate>();
  for (const candidate of candidates) {
    const identity = candidate.repositoryId.toLowerCase();
    if (indexed.has(identity)) {
      return fail("Duplicate repository candidate.", { repositoryId: candidate.repositoryId });
    }
    indexed.set(identity, candidate);
  }
  return success(indexed);
}

/** 校验 Proposal 对每个候选仓恰好给出一份选择。 */
export function validateRepositorySelectionSet(
  candidates: ReadonlyMap<string, ProjectProfileCandidate>,
  proposal: ProjectProfileProposalPayload,
): Result<void, HarnessError> {
  const selected = new Set<string>();
  for (const selection of proposal.repositorySelections) {
    const identity = selection.repositoryId.toLowerCase();
    if (selected.has(identity)) {
      return fail("Duplicate repository selection.", { repositoryId: selection.repositoryId });
    }
    selected.add(identity);
  }
  return expectSameSet(candidates.keys(), selected, "Repository selection set mismatch.");
}

/** 不依赖外层 parser，校验单仓候选全部身份、范围和摘要。 */
export function validateCandidate(
  report: ProjectDiscoveryReport,
  candidate: ProjectProfileCandidate,
  selection: ProjectProfileProposalPayload["repositorySelections"][number],
  provenance: ProjectProfileCompilerProvenance,
  digestPort: ProjectProfileDigestPort,
): Result<void, HarnessError> {
  if (selection.repositoryId !== candidate.repositoryId) {
    return fail("Repository selection identity drifted.");
  }
  if (selection.repositoryRevision !== candidate.repositoryRevision) {
    return fail("Repository revision drifted.", { repositoryId: candidate.repositoryId });
  }
  if (selection.profileCandidateDigest !== candidate.digest) {
    return fail("Project profile candidate digest drifted.");
  }
  const identities = validateCandidateIdentities(candidate);
  if (identities.status === ResultStatus.Failure) return identities;
  const digestCheck = expectDigest(
    digestPort,
    createProjectProfileCandidateDigestInput(candidate),
    candidate.digest,
    "Project profile candidate digest drifted.",
  );
  if (digestCheck.status === ResultStatus.Failure) return digestCheck;

  for (const rule of candidate.ruleCandidates) {
    const ruleCheck = validateRuleBinding(report, candidate, provenance, rule);
    if (ruleCheck.status === ResultStatus.Failure) return ruleCheck;
    const ruleDigest = expectDigest(
      digestPort,
      createRuleDigestInput(rule),
      rule.digest,
      "Rule candidate digest drifted.",
    );
    if (ruleDigest.status === ResultStatus.Failure) return ruleDigest;
  }
  for (const mechanism of candidate.mechanismCandidates) {
    if (mechanism.repositoryId !== candidate.repositoryId) {
      return fail("Architecture mechanism repository identity drifted.");
    }
    const mechanismDigest = expectDigest(
      digestPort,
      createArchitectureMechanismCandidateDigestInput(mechanism),
      mechanism.digest,
      "Architecture mechanism candidate digest drifted.",
    );
    if (mechanismDigest.status === ResultStatus.Failure) return mechanismDigest;
  }
  return success(undefined);
}

function validateCandidateIdentities(
  candidate: ProjectProfileCandidate,
): Result<void, HarnessError> {
  const mechanismIds = candidate.mechanismCandidates.map((item) => item.candidateId.toLowerCase());
  if (new Set(mechanismIds).size !== mechanismIds.length) {
    return fail("Duplicate architecture mechanism candidate identity.");
  }
  const ruleIds = candidate.ruleCandidates.map(
    (rule) => `${rule.ruleId.toLowerCase()}@${rule.version}`,
  );
  if (new Set(ruleIds).size !== ruleIds.length) {
    return fail("Duplicate rule candidate identity.");
  }
  return success(undefined);
}

function validateRuleBinding(
  report: ProjectDiscoveryReport,
  candidate: ProjectProfileCandidate,
  provenance: ProjectProfileCompilerProvenance,
  rule: RuleDefinition,
): Result<void, HarnessError> {
  if (rule.status !== RuleStatus.Candidate) {
    return fail("Rule candidate must have Candidate status.", { ruleId: rule.ruleId });
  }
  const repositoryScoped =
    rule.scope.level === RuleScopeLevel.Repository || rule.scope.level === RuleScopeLevel.Path;
  if (rule.scope.level === RuleScopeLevel.Repository || rule.scope.level === RuleScopeLevel.Path) {
    if (
      rule.scope.workspaceId !== report.workspaceId ||
      rule.scope.repositoryId !== candidate.repositoryId
    ) {
      return fail("Repository-scoped rule identity drifted.", { ruleId: rule.ruleId });
    }
  } else if (
    (rule.scope.level === RuleScopeLevel.Workspace || rule.scope.level === RuleScopeLevel.Task) &&
    rule.scope.workspaceId !== report.workspaceId
  ) {
    return fail("Non-repository rule workspace identity drifted.", { ruleId: rule.ruleId });
  } else if (rule.scope.level === RuleScopeLevel.Task && rule.scope.taskId !== provenance.taskId) {
    return fail("Task-scoped rule task identity drifted.", { ruleId: rule.ruleId });
  }

  const selectorRepositories = rule.selector?.repositoryIds;
  if (
    repositoryScoped &&
    (selectorRepositories?.length !== 1 || selectorRepositories[0] !== candidate.repositoryId)
  ) {
    return fail("Repository-scoped rule selector identity drifted.", { ruleId: rule.ruleId });
  }
  if (selectorRepositories?.some((id) => id !== candidate.repositoryId) === true) {
    return fail("Rule selector references a different repository.", { ruleId: rule.ruleId });
  }

  for (const source of [...rule.sourceRefs, ...rule.invalidationRefs]) {
    if (
      repositoryScoped
        ? source.revision !== candidate.repositoryRevision
        : source.revision !== undefined && source.revision !== candidate.repositoryRevision
    ) {
      return fail("Rule source revision drifted.", { ruleId: rule.ruleId });
    }
  }
  if (repositoryScoped) {
    for (const example of [...rule.approvedExampleRefs, ...rule.negativeExampleRefs]) {
      if (
        example.repositoryId !== candidate.repositoryId ||
        example.revision !== candidate.repositoryRevision
      ) {
        return fail("Rule example identity drifted.", { ruleId: rule.ruleId });
      }
    }
  }
  return success(undefined);
}
