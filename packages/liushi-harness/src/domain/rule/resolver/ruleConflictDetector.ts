import { RULE_ENFORCEMENT_STRENGTH } from "../constants/index.js";
import type { ApplicableRuleEntry, RuleConflict, RuleDefinition } from "../contracts/index.js";
import { RuleConflictKind } from "../enums/index.js";
import {
  compareRuleStrings,
  ruleDefinitionIdentity,
  ruleScopeIdentity,
  ruleScopeSpecificity,
  sortUniqueRuleStrings,
  toRuleConflictRef,
} from "./ruleResolutionOrdering.js";

/** 检测 Applicable Rule 中可由结构化字段证明的全部冲突。 */
export function detectRuleConflicts(
  entries: readonly ApplicableRuleEntry[],
  definitions: readonly RuleDefinition[],
): readonly RuleConflict[] {
  const definitionsByIdentity = new Map(
    definitions.map((rule) => [ruleDefinitionIdentity(rule), rule]),
  );
  const conflicts = new Map<string, RuleConflict>();

  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    const left = entries[leftIndex];
    if (left === undefined) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const right = entries[rightIndex];
      if (right === undefined) {
        continue;
      }
      const targetIds = intersectTargets(left.matchedTargetIds, right.matchedTargetIds);
      if (targetIds.length === 0) {
        continue;
      }
      const leftDefinition = definitionsByIdentity.get(entryDefinitionIdentity(left));
      const rightDefinition = definitionsByIdentity.get(entryDefinitionIdentity(right));
      if (leftDefinition === undefined || rightDefinition === undefined) {
        continue;
      }

      if (
        leftDefinition.conflictsWithRuleIds.includes(right.ruleId) ||
        rightDefinition.conflictsWithRuleIds.includes(left.ruleId)
      ) {
        addConflict(
          conflicts,
          RuleConflictKind.Explicit,
          left,
          right,
          targetIds,
          "Matched rules declare an explicit conflict.",
        );
      }
      if (left.ruleId === right.ruleId && left.version !== right.version) {
        addConflict(
          conflicts,
          RuleConflictKind.MultipleActiveVersions,
          left,
          right,
          targetIds,
          "Multiple Active versions of the same rule matched one target.",
        );
      }
      detectFamilyConflict(conflicts, left, right, targetIds);
    }
  }

  return [...conflicts.values()].sort((left, right) =>
    compareRuleStrings(conflictIdentity(left), conflictIdentity(right)),
  );
}

function detectFamilyConflict(
  conflicts: Map<string, RuleConflict>,
  left: ApplicableRuleEntry,
  right: ApplicableRuleEntry,
  targetIds: readonly string[],
): void {
  if (left.familyKey !== right.familyKey || left.outcomeKey === right.outcomeKey) {
    return;
  }
  const leftScopeIdentity = ruleScopeIdentity(left.scope);
  const rightScopeIdentity = ruleScopeIdentity(right.scope);
  const leftSpecificity = ruleScopeSpecificity(left.scope);
  const rightSpecificity = ruleScopeSpecificity(right.scope);
  if (leftScopeIdentity === rightScopeIdentity || leftSpecificity === rightSpecificity) {
    addConflict(
      conflicts,
      RuleConflictKind.SameScopeOutcome,
      left,
      right,
      targetIds,
      "Rules at the same precedence declare different outcomes for one family.",
    );
    return;
  }

  const [general, specific] = leftSpecificity < rightSpecificity ? [left, right] : [right, left];
  if (
    RULE_ENFORCEMENT_STRENGTH[specific.enforcement] <=
    RULE_ENFORCEMENT_STRENGTH[general.enforcement]
  ) {
    addConflict(
      conflicts,
      RuleConflictKind.InvalidWeakening,
      general,
      specific,
      targetIds,
      "A more specific scope cannot replace an upper outcome with equal or weaker enforcement.",
    );
  }
}

function addConflict(
  conflicts: Map<string, RuleConflict>,
  kind: RuleConflictKind,
  left: ApplicableRuleEntry,
  right: ApplicableRuleEntry,
  targetIds: readonly string[],
  message: string,
): void {
  const rules = [toRuleConflictRef(left), toRuleConflictRef(right)].sort((first, second) =>
    compareRuleStrings(
      `${first.ruleId}@${first.version}#${first.ruleDigest}`,
      `${second.ruleId}@${second.version}#${second.ruleDigest}`,
    ),
  );
  const conflict: RuleConflict = {
    kind,
    rules,
    targetIds: sortUniqueRuleStrings(targetIds),
    message,
  };
  conflicts.set(conflictIdentity(conflict), conflict);
}

function intersectTargets(left: readonly string[], right: readonly string[]): readonly string[] {
  const rightSet = new Set(right);
  return sortUniqueRuleStrings(left.filter((targetId) => rightSet.has(targetId)));
}

function entryDefinitionIdentity(entry: ApplicableRuleEntry): string {
  return `${entry.ruleId}@${entry.version}#${entry.ruleDigest}`;
}

function conflictIdentity(conflict: RuleConflict): string {
  return `${conflict.kind}:${conflict.rules
    .map((rule) => `${rule.ruleId}@${rule.version}#${rule.ruleDigest}`)
    .join("|")}:${conflict.targetIds.join("|")}`;
}
