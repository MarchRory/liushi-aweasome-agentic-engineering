import type {
  ApplicableRuleEntry,
  RepositoryRuleContextRef,
  RuleConflictRef,
  RuleDefinition,
  RuleResolutionTarget,
  RuleScope,
} from "../contracts/index.js";
import { RULE_SCOPE_SPECIFICITY } from "../constants/index.js";
import { RuleScopeLevel } from "../enums/index.js";

/** 按 Unicode code point 生成跨平台稳定字符串顺序。 */
export function compareRuleStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** 返回去重并按稳定顺序排列的字符串集合。 */
export function sortUniqueRuleStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareRuleStrings);
}

/** 按 Repository ID 排列 Context Ref。 */
export function sortRepositoryContextRefs(
  refs: readonly RepositoryRuleContextRef[],
): readonly RepositoryRuleContextRef[] {
  return [...refs].sort((left, right) => compareRuleStrings(left.repositoryId, right.repositoryId));
}

/** 按 Target ID 排列 Resolution Target。 */
export function sortRuleResolutionTargets(
  targets: readonly RuleResolutionTarget[],
): readonly RuleResolutionTarget[] {
  return [...targets].sort((left, right) => compareRuleStrings(left.targetId, right.targetId));
}

/** 按 Rule ID、Version 与 Digest 排列 Rule Definition。 */
export function sortRuleDefinitions(rules: readonly RuleDefinition[]): readonly RuleDefinition[] {
  return [...rules].sort((left, right) =>
    compareRuleStrings(ruleDefinitionIdentity(left), ruleDefinitionIdentity(right)),
  );
}

/** 按 Rule ID、Version 与 Digest 排列 Applicable Rule。 */
export function sortApplicableRules(
  rules: readonly ApplicableRuleEntry[],
): readonly ApplicableRuleEntry[] {
  return [...rules].sort((left, right) =>
    compareRuleStrings(applicableRuleIdentity(left), applicableRuleIdentity(right)),
  );
}

/** 返回 Rule Definition 的稳定 Revision 身份。 */
export function ruleDefinitionIdentity(rule: RuleDefinition): string {
  return `${rule.ruleId}@${rule.version}#${rule.digest}`;
}

/** 返回 Applicable Rule 的稳定 Revision 身份。 */
export function applicableRuleIdentity(rule: ApplicableRuleEntry): string {
  return `${rule.ruleId}@${rule.version}#${rule.ruleDigest}`;
}

/** 将 Applicable Rule 转换为冲突报告的最小引用。 */
export function toRuleConflictRef(rule: ApplicableRuleEntry): RuleConflictRef {
  return {
    ruleId: rule.ruleId,
    version: rule.version,
    ruleDigest: rule.ruleDigest,
  };
}

/** 返回包含 Scope 身份边界的稳定比较 Key。 */
export function ruleScopeIdentity(scope: RuleScope): string {
  switch (scope.level) {
    case RuleScopeLevel.Harness:
      return scope.level;
    case RuleScopeLevel.Organization:
      return `${scope.level}:${scope.organizationId}`;
    case RuleScopeLevel.Workspace:
      return `${scope.level}:${scope.workspaceId}`;
    case RuleScopeLevel.Repository:
      return `${scope.level}:${scope.workspaceId}:${scope.repositoryId}`;
    case RuleScopeLevel.Path:
      return `${scope.level}:${scope.workspaceId}:${scope.repositoryId}:${scope.pathPrefix}`;
    case RuleScopeLevel.Task:
      return `${scope.level}:${scope.workspaceId}:${scope.taskId}`;
  }
}

/** 返回 Scope 的确定性具体程度；更大值表示更具体。 */
export function ruleScopeSpecificity(scope: RuleScope): number {
  const base = RULE_SCOPE_SPECIFICITY[scope.level] * 1_000;
  return scope.level === RuleScopeLevel.Path ? base + scope.pathPrefix.split("/").length : base;
}
