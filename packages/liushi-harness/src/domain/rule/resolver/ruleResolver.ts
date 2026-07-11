import { RULE_BUNDLE_SCHEMA_VERSION } from "#common/index.js";

import { RULE_ENFORCEMENT_STRENGTH, RULE_RESOLVER_VERSION } from "../constants/index.js";
import type {
  ApplicableRuleEntry,
  ExcludedRuleEntry,
  ProjectRuleCatalog,
  ResolvedRuleBundle,
  RuleCodeExampleRef,
  RuleDefinition,
  RuleResolutionContext,
  RuleSelector,
  RuleTargetFamilyResolution,
} from "../contracts/index.js";
import {
  RuleEnforcement,
  RuleExclusionReason,
  RuleResolutionStatus,
  RuleStatus,
} from "../enums/index.js";
import { matchesRuleSelector, selectTargetsByRuleScope } from "../selector/index.js";
import { detectRuleConflicts } from "./ruleConflictDetector.js";
import { detectRuleContextDrifts } from "./ruleContextDriftDetector.js";
import {
  compareRuleStrings,
  sortApplicableRules,
  sortRepositoryContextRefs,
  sortRuleDefinitions,
  sortRuleResolutionTargets,
  sortUniqueRuleStrings,
} from "./ruleResolutionOrdering.js";
import {
  detectMissingRuleCapabilities,
  detectMissingRuleValidators,
  detectRuleDefinitionViolations,
} from "./ruleRequirementDetector.js";

/** 将已通过 Schema 与 Digest 校验的 Catalog 解析为确定性 Rule Bundle。 */
export function resolveApplicableRules(
  catalog: ProjectRuleCatalog,
  context: RuleResolutionContext,
): ResolvedRuleBundle {
  const definitions = sortRuleDefinitions(catalog.rules);
  const rules: ApplicableRuleEntry[] = [];
  const excluded: ExcludedRuleEntry[] = [];

  for (const definition of definitions) {
    if (definition.status !== RuleStatus.Active) {
      excluded.push(toExcludedRule(definition, RuleExclusionReason.InactiveStatus));
      continue;
    }
    const scopeTargets = selectTargetsByRuleScope(definition.scope, context);
    if (scopeTargets.length === 0) {
      excluded.push(toExcludedRule(definition, RuleExclusionReason.ScopeMismatch));
      continue;
    }
    const matchedTargets = scopeTargets.filter((target) =>
      matchesRuleSelector(definition.selector, target),
    );
    if (matchedTargets.length === 0) {
      excluded.push(toExcludedRule(definition, RuleExclusionReason.SelectorMismatch));
      continue;
    }
    rules.push(
      toApplicableRule(
        definition,
        matchedTargets.map((target) => target.targetId),
      ),
    );
  }

  const sortedRules = sortApplicableRules(rules);
  const conflicts = detectRuleConflicts(sortedRules, definitions);
  const missingValidators = detectMissingRuleValidators(sortedRules, context.availableValidatorIds);
  const missingCapabilities = detectMissingRuleCapabilities(
    sortedRules,
    context.availableCapabilityIds,
  );
  const contextDrifts = detectRuleContextDrifts(catalog, context);
  const definitionViolations = detectRuleDefinitionViolations(sortedRules);
  const blocked =
    conflicts.length > 0 ||
    missingValidators.length > 0 ||
    missingCapabilities.some((missing) => missing.enforcement !== RuleEnforcement.Advisory) ||
    contextDrifts.length > 0 ||
    definitionViolations.length > 0;

  return {
    schemaVersion: RULE_BUNDLE_SCHEMA_VERSION,
    resolverVersion: RULE_RESOLVER_VERSION,
    taskId: context.taskId,
    workspaceRef: context.workspaceRef,
    repositoryRefs: sortRepositoryContextRefs(context.repositoryRefs),
    targets: sortRuleResolutionTargets(context.targets),
    rules: sortedRules,
    targetFamilyResolutions: resolveTargetFamilies(sortedRules),
    excluded: [...excluded].sort((left, right) =>
      compareRuleStrings(
        `${left.ruleId}@${left.version}:${left.reason}`,
        `${right.ruleId}@${right.version}:${right.reason}`,
      ),
    ),
    conflicts,
    missingValidators,
    missingCapabilities,
    contextDrifts,
    definitionViolations,
    resolutionStatus: blocked ? RuleResolutionStatus.Blocked : RuleResolutionStatus.Ready,
  };
}

function toExcludedRule(rule: RuleDefinition, reason: RuleExclusionReason): ExcludedRuleEntry {
  return { ruleId: rule.ruleId, version: rule.version, status: rule.status, reason };
}

function toApplicableRule(
  rule: RuleDefinition,
  matchedTargetIds: readonly string[],
): ApplicableRuleEntry {
  return {
    ruleId: rule.ruleId,
    version: rule.version,
    ruleDigest: rule.digest,
    familyKey: rule.familyKey,
    outcomeKey: rule.outcomeKey,
    enforcement: rule.enforcement,
    scope: rule.scope,
    selector: normalizeSelector(rule.selector),
    statement: rule.statement,
    matchedTargetIds: sortUniqueRuleStrings(matchedTargetIds),
    validatorIds: sortUniqueRuleStrings(rule.validatorIds),
    requiredCapabilityIds: sortUniqueRuleStrings(rule.requiredCapabilityIds),
    approvedExampleRefs: sortCodeExamples(rule.approvedExampleRefs),
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

function sortCodeExamples(examples: readonly RuleCodeExampleRef[]): readonly RuleCodeExampleRef[] {
  return [...examples].sort((left, right) =>
    compareRuleStrings(
      `${left.repositoryId}:${left.revision}:${left.relativePath}:${left.contentDigest ?? ""}`,
      `${right.repositoryId}:${right.revision}:${right.relativePath}:${right.contentDigest ?? ""}`,
    ),
  );
}

function resolveTargetFamilies(
  rules: readonly ApplicableRuleEntry[],
): readonly RuleTargetFamilyResolution[] {
  const groups = new Map<
    string,
    { targetId: string; familyKey: string; entries: ApplicableRuleEntry[] }
  >();
  for (const rule of rules) {
    for (const targetId of rule.matchedTargetIds) {
      const key = `${targetId.length}:${targetId}${rule.familyKey}`;
      const group = groups.get(key);
      groups.set(key, {
        targetId,
        familyKey: rule.familyKey,
        entries: [...(group?.entries ?? []), rule],
      });
    }
  }

  return [...groups.values()]
    .map(({ targetId, familyKey, entries }) => {
      const effective = entries.reduce((strongest, candidate) =>
        RULE_ENFORCEMENT_STRENGTH[candidate.enforcement] >
        RULE_ENFORCEMENT_STRENGTH[strongest.enforcement]
          ? candidate
          : strongest,
      );
      return {
        targetId,
        familyKey,
        effectiveEnforcement: effective.enforcement,
        contributingRuleIds: sortUniqueRuleStrings(entries.map((entry) => entry.ruleId)),
      };
    })
    .sort((left, right) =>
      compareRuleStrings(
        `${left.targetId}:${left.familyKey}`,
        `${right.targetId}:${right.familyKey}`,
      ),
    );
}
