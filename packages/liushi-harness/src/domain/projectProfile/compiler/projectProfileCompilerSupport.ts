import {
  failure,
  HarnessError,
  HarnessErrorCode,
  RULE_CATALOG_SCHEMA_VERSION,
  RULE_SCHEMA_VERSION,
  ResultStatus,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import type { ProjectDiscoveryReport } from "#domain/projectDiscovery/index.js";
import {
  createProjectRuleCatalogDigestInput,
  createRuleDigestInput,
  parseProjectRuleCatalog,
  RuleStatus,
  type ProjectRuleCatalog,
  type RuleDefinition,
} from "#domain/rule/index.js";

import type { ProjectProfile, ProjectProfileDigestPort } from "../contracts/index.js";

/** 创建编译器校验使用的 HarnessError 失败结果。 */
export function fail(
  message: string,
  details: Readonly<Record<string, string>> = {},
): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.DecisionConflict, message, details));
}

/** 校验依赖图只引用 Profile Candidate 中存在的 Repository。 */
export function validateReportRepositoryGraph(
  report: ProjectDiscoveryReport,
): Result<void, HarnessError> {
  const repositoryIds = new Set(
    report.profileCandidates.map((candidate) => candidate.repositoryId),
  );
  for (const edge of report.dependencyEdges) {
    if (!repositoryIds.has(edge.fromRepositoryId)) {
      return fail("Dependency graph references an unknown repository.", {
        repositoryId: edge.fromRepositoryId,
      });
    }
    if (!repositoryIds.has(edge.toRepositoryId)) {
      return fail("Dependency graph references an unknown repository.", {
        repositoryId: edge.toRepositoryId,
      });
    }
  }
  for (const ambiguity of report.dependencyAmbiguities) {
    if (!repositoryIds.has(ambiguity.fromRepositoryId)) {
      return fail("Dependency graph references an unknown repository.", {
        repositoryId: ambiguity.fromRepositoryId,
      });
    }
    for (const owner of ambiguity.owners) {
      if (!repositoryIds.has(owner)) {
        return fail("Dependency graph references an unknown repository.", { repositoryId: owner });
      }
    }
  }
  return success(undefined);
}

/** 计算 Digest 并与期望值比较。 */
export function expectDigest(
  digestPort: ProjectProfileDigestPort,
  input: unknown,
  expected: ContentDigest,
  message: string,
): Result<void, HarnessError> {
  const calculated = digestPort.calculate(input);
  if (calculated.status === ResultStatus.Failure) return calculated;
  if (calculated.value !== expected) {
    return fail(message, { expected, actual: calculated.value });
  }
  return success(undefined);
}

/** 校验两个 ID 集合表示同一个去重集合。 */
export function expectSameSet(
  expected: Iterable<string>,
  actual: ReadonlySet<string>,
  message: string,
): Result<void, HarnessError> {
  const expectedSet = new Set(expected);
  for (const id of actual) {
    if (!expectedSet.has(id)) return fail(message, { unknownId: id });
  }
  for (const id of expectedSet) {
    if (!actual.has(id)) return fail(message, { missingId: id });
  }
  return success(undefined);
}

/** 校验 accepted 与 rejected ID 构成完整且无交集的分区。 */
export function validatePartition(
  candidateIds: readonly string[],
  acceptedIds: readonly string[],
  rejectedIds: readonly string[],
  message: string,
): Result<void, HarnessError> {
  const accepted = new Set<string>();
  for (const id of acceptedIds) {
    if (accepted.has(id)) return fail(message, { duplicateAcceptedId: id });
    accepted.add(id);
  }
  const rejected = new Set<string>();
  for (const id of rejectedIds) {
    if (accepted.has(id)) return fail(message, { intersectingId: id });
    if (rejected.has(id)) return fail(message, { duplicateRejectedId: id });
    rejected.add(id);
  }
  return expectSameSet(candidateIds, new Set([...accepted, ...rejected]), message);
}

/** 将已接受 Candidate Rule 提升为 Active 并重新计算 Digest。 */
export function promoteRules(
  ruleCandidates: readonly RuleDefinition[],
  acceptedRuleIds: readonly string[],
  reviewedAt: string,
  digestPort: ProjectProfileDigestPort,
): Result<readonly RuleDefinition[], HarnessError> {
  const accepted = new Set(acceptedRuleIds);
  const promoted: RuleDefinition[] = [];
  for (const rule of ruleCandidates) {
    if (!accepted.has(rule.ruleId)) continue;
    const withoutDigest: RuleDefinition = {
      ...rule,
      schemaVersion: RULE_SCHEMA_VERSION,
      status: RuleStatus.Active,
      reviewedAt,
    };
    const digest = digestPort.calculate(createRuleDigestInput(withoutDigest));
    if (digest.status === ResultStatus.Failure) return digest;
    promoted.push({ ...withoutDigest, digest: digest.value });
  }
  return success(promoted.sort(compareRules));
}

/** 创建已提升 ProjectRuleCatalog 并重新计算 Digest。 */
export function createCatalog(
  report: ProjectDiscoveryReport,
  revision: number,
  profiles: readonly ProjectProfile[],
  rules: readonly RuleDefinition[],
  digestPort: ProjectProfileDigestPort,
): Result<ProjectRuleCatalog, HarnessError> {
  const catalog: ProjectRuleCatalog = {
    schemaVersion: RULE_CATALOG_SCHEMA_VERSION,
    catalogId: `project-rule-catalog:${report.workspaceId}`,
    revision,
    workspaceRef: {
      workspaceId: report.workspaceId,
      workspaceGraphRevision: report.workspaceGraphRevision,
    },
    repositoryRefs: profiles.map((profile) => ({
      repositoryId: profile.repositoryId,
      repositoryRevision: profile.repositoryRevision,
      projectProfileRevision: profile.digest,
      architectureMechanismProfileRevision: profile.digest,
    })),
    rules: [...rules].sort(compareRules),
    digest: report.digest,
  };
  const digest = digestPort.calculate(createProjectRuleCatalogDigestInput(catalog));
  if (digest.status === ResultStatus.Failure) return digest;
  const parsed = parseProjectRuleCatalog({ ...catalog, digest: digest.value });
  return parsed.status === ResultStatus.Failure ? parsed : success(parsed.value);
}

/** 按 Repository ID 排序 Repository 绑定值。 */
export function sortByRepository<T extends { repositoryId: string }>(values: readonly T[]): T[] {
  return [...values].sort(compareByRepository);
}

/** 按 Repository ID 比较 Repository 绑定值。 */
export function compareByRepository(
  left: { repositoryId: string },
  right: { repositoryId: string },
): number {
  return compare(left.repositoryId, right.repositoryId);
}

/** 按稳定 Rule 身份比较 Rule Definition。 */
export function compareRules(left: RuleDefinition, right: RuleDefinition): number {
  return compare(
    `${left.ruleId}@${left.version}#${left.digest}`,
    `${right.ruleId}@${right.version}#${right.digest}`,
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
