import type {
  ApplicableRuleBundleDigestInput,
  ProjectRuleCatalog,
  ProjectRuleCatalogDigestInput,
  ResolvedRuleBundle,
  RuleCodeExampleRef,
  RuleDefinition,
  RuleDigestInput,
  RuleSelector,
  RuleSourceRef,
} from "../contracts/index.js";
import {
  compareRuleStrings,
  sortRepositoryContextRefs,
  sortUniqueRuleStrings,
} from "../resolver/index.js";

/** 创建不包含自引用 digest 且集合字段稳定排序的 Rule Digest 输入。 */
export function createRuleDigestInput(rule: RuleDefinition): RuleDigestInput {
  return {
    schemaVersion: rule.schemaVersion,
    ruleId: rule.ruleId,
    version: rule.version,
    status: rule.status,
    category: rule.category,
    enforcement: rule.enforcement,
    familyKey: rule.familyKey,
    outcomeKey: rule.outcomeKey,
    scope: rule.scope,
    selector: normalizeSelector(rule.selector),
    statement: rule.statement,
    rationale: rule.rationale,
    validatorIds: sortUniqueRuleStrings(rule.validatorIds),
    requiredCapabilityIds: sortUniqueRuleStrings(rule.requiredCapabilityIds),
    sourceRefs: sortSourceRefs(rule.sourceRefs),
    invalidationRefs: sortSourceRefs(rule.invalidationRefs),
    approvedExampleRefs: sortCodeExamples(rule.approvedExampleRefs),
    negativeExampleRefs: sortCodeExamples(rule.negativeExampleRefs),
    conflictsWithRuleIds: sortUniqueRuleStrings(rule.conflictsWithRuleIds),
    owner: rule.owner,
    ...(rule.reviewedAt === undefined ? {} : { reviewedAt: rule.reviewedAt }),
  };
}

/** 创建仅绑定 Rule 索引与 Context Revision 的 Catalog Digest 输入。 */
export function createProjectRuleCatalogDigestInput(
  catalog: ProjectRuleCatalog,
): ProjectRuleCatalogDigestInput {
  return {
    schemaVersion: catalog.schemaVersion,
    catalogId: catalog.catalogId,
    revision: catalog.revision,
    workspaceRef: catalog.workspaceRef,
    repositoryRefs: sortRepositoryContextRefs(catalog.repositoryRefs),
    rules: catalog.rules
      .map((rule) => ({
        ruleId: rule.ruleId,
        version: rule.version,
        status: rule.status,
        digest: rule.digest,
      }))
      .sort((left, right) =>
        compareRuleStrings(
          `${left.ruleId}@${left.version}#${left.digest}`,
          `${right.ruleId}@${right.version}#${right.digest}`,
        ),
      ),
  };
}

/** 创建排除审计型 excluded 字段的 Applicable Rule Bundle Digest 输入。 */
export function createApplicableRuleBundleDigestInput(
  bundle: ResolvedRuleBundle,
): ApplicableRuleBundleDigestInput {
  return {
    schemaVersion: bundle.schemaVersion,
    resolverVersion: bundle.resolverVersion,
    taskId: bundle.taskId,
    workspaceRef: bundle.workspaceRef,
    repositoryRefs: bundle.repositoryRefs,
    targets: bundle.targets,
    rules: bundle.rules,
    targetFamilyResolutions: bundle.targetFamilyResolutions,
    conflicts: bundle.conflicts,
    missingValidators: bundle.missingValidators,
    missingCapabilities: bundle.missingCapabilities,
    contextDrifts: bundle.contextDrifts,
    definitionViolations: bundle.definitionViolations,
    resolutionStatus: bundle.resolutionStatus,
  };
}

function normalizeSelector(selector: RuleSelector): RuleSelector {
  return {
    ...(selector.repositoryIds === undefined
      ? {}
      : { repositoryIds: [...selector.repositoryIds].sort(compareRuleStrings) }),
    ...(selector.pathGlobs === undefined
      ? {}
      : { pathGlobs: [...selector.pathGlobs].sort(compareRuleStrings) }),
    ...(selector.languages === undefined
      ? {}
      : { languages: [...selector.languages].sort(compareRuleStrings) }),
    ...(selector.fileKinds === undefined
      ? {}
      : { fileKinds: [...selector.fileKinds].sort(compareRuleStrings) }),
    ...(selector.operations === undefined
      ? {}
      : { operations: [...selector.operations].sort(compareRuleStrings) }),
  };
}

function sortSourceRefs(refs: readonly RuleSourceRef[]): readonly RuleSourceRef[] {
  return [...refs].sort((left, right) =>
    compareRuleStrings(sourceRefIdentity(left), sourceRefIdentity(right)),
  );
}

function sourceRefIdentity(ref: RuleSourceRef): string {
  return `${ref.kind}:${ref.sourceId}:${ref.revision ?? ""}:${ref.digest ?? ""}`;
}

function sortCodeExamples(examples: readonly RuleCodeExampleRef[]): readonly RuleCodeExampleRef[] {
  return [...examples].sort((left, right) =>
    compareRuleStrings(
      `${left.repositoryId}:${left.revision}:${left.relativePath}:${left.contentDigest ?? ""}`,
      `${right.repositoryId}:${right.revision}:${right.relativePath}:${right.contentDigest ?? ""}`,
    ),
  );
}
