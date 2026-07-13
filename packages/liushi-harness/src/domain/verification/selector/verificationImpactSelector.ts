import { minimatch, type MinimatchOptions } from "minimatch";

import { ResultStatus } from "#common/index.js";
import { RuleEnforcement, normalizeRuleRelativePath } from "#domain/rule/index.js";

import type {
  ProjectVerificationCheck,
  VerificationImpactCheckSelection,
  VerificationImpactDiagnostic,
  VerificationImpactSelection,
  VerificationImpactSelectorInput,
} from "../contracts/index.js";
import {
  VerificationCheckSelectionReason,
  VerificationCheckSelectionStatus,
  VerificationImpactDiagnosticCode,
  VerificationImpactSelectionStatus,
  VerificationRequirement,
  VerificationSelectionMode,
} from "../enums/index.js";

const VERIFICATION_MINIMATCH_OPTIONS: MinimatchOptions = {
  dot: true,
  nocase: false,
  nocomment: true,
  nonegate: true,
  noext: true,
  nobrace: true,
};

/** 纯函数计算项目 Verification Check 的确定性变更影响面。 */
export function verificationImpactSelector(
  input: VerificationImpactSelectorInput,
): VerificationImpactSelection {
  const normalizedPaths = normalizeChangedPaths(input.changedPaths);
  const ruleImpact = resolveRuleImpact(input, normalizedPaths.paths);
  const conservative =
    input.changedPaths.length === 0 ||
    normalizedPaths.invalidPaths.length > 0 ||
    ruleImpact.missingPaths.length > 0;
  const sortedChecks = [...input.checks].sort((left, right) =>
    compare(left.checkId, right.checkId),
  );
  const checks = sortedChecks.map((check) =>
    selectCheck(check, normalizedPaths.paths, ruleImpact.rules, conservative),
  );
  const diagnostics = collectInputDiagnostics(
    normalizedPaths.invalidPaths,
    ruleImpact.missingPaths,
  );
  diagnostics.push(...collectDiagnostics(sortedChecks, ruleImpact.rules));

  if (sortedChecks.length === 0) {
    diagnostics.unshift({
      code: VerificationImpactDiagnosticCode.VerificationChecksMissing,
      validatorIds: [],
      message: "Project Verification Check 缺失。",
    });
  }

  return {
    status:
      diagnostics.length === 0
        ? VerificationImpactSelectionStatus.Ready
        : VerificationImpactSelectionStatus.Blocked,
    checks,
    diagnostics,
  };
}

function resolveRuleImpact(
  input: VerificationImpactSelectorInput,
  changedPaths: readonly string[],
): {
  rules: readonly VerificationImpactSelectorInput["applicableRules"][number][];
  missingPaths: readonly string[];
} {
  const repositoryTargets = input.ruleTargets.filter(
    (target) => target.repositoryId === input.repositoryId,
  );
  const targetIdsByPath = new Map<string, string[]>();
  for (const target of repositoryTargets) {
    const targetIds = targetIdsByPath.get(target.relativePath) ?? [];
    targetIds.push(target.targetId);
    targetIdsByPath.set(target.relativePath, targetIds);
  }
  const missingPaths = changedPaths.filter((path) => !targetIdsByPath.has(path));
  const useAllRepositoryTargets = changedPaths.length === 0;
  const relevantTargetIds = new Set(
    useAllRepositoryTargets
      ? repositoryTargets.map((target) => target.targetId)
      : changedPaths.flatMap((path) => targetIdsByPath.get(path) ?? []),
  );
  const rules = [...input.applicableRules]
    .filter((rule) => rule.matchedTargetIds.some((targetId) => relevantTargetIds.has(targetId)))
    .sort((left, right) => compare(left.ruleId, right.ruleId));
  return { rules, missingPaths };
}

function collectInputDiagnostics(
  invalidPaths: readonly string[],
  missingPaths: readonly string[],
): VerificationImpactDiagnostic[] {
  const diagnostics: VerificationImpactDiagnostic[] = [];
  if (invalidPaths.length > 0) {
    diagnostics.push({
      code: VerificationImpactDiagnosticCode.ChangedPathInvalid,
      validatorIds: [],
      paths: invalidPaths,
      message: "Changed Paths 包含非法 Repository 相对路径。",
    });
  }
  if (missingPaths.length > 0) {
    diagnostics.push({
      code: VerificationImpactDiagnosticCode.RuleTargetCoverageIncomplete,
      validatorIds: [],
      paths: missingPaths,
      message: "Rule Bundle Target 未完整覆盖 Changed Paths。",
    });
  }
  return diagnostics;
}

function selectCheck(
  check: ProjectVerificationCheck,
  changedPaths: readonly string[],
  relevantRules: VerificationImpactSelectorInput["applicableRules"],
  conservative: boolean,
): VerificationImpactCheckSelection {
  const matchedPaths = changedPaths.filter((path) =>
    (check.pathGlobs ?? []).some((glob) => minimatch(path, glob, VERIFICATION_MINIMATCH_OPTIONS)),
  );
  const contributingRuleIds = relevantRules
    .filter((rule) =>
      rule.validatorIds.some((validatorId) => check.validatorIds.includes(validatorId)),
    )
    .map((rule) => rule.ruleId)
    .sort(compare);
  const reason = selectReason(
    check,
    matchedPaths.length > 0,
    contributingRuleIds.length > 0,
    conservative,
  );

  return {
    check,
    status:
      reason === VerificationCheckSelectionReason.NotImpacted
        ? VerificationCheckSelectionStatus.Excluded
        : VerificationCheckSelectionStatus.Selected,
    reason,
    matchedPaths,
    contributingRuleIds,
  };
}

function selectReason(
  check: ProjectVerificationCheck,
  pathMatched: boolean,
  ruleMatched: boolean,
  conservative: boolean,
): VerificationCheckSelectionReason {
  if (check.requirement === VerificationRequirement.Required) {
    return VerificationCheckSelectionReason.Required;
  }
  if (check.selectionMode === VerificationSelectionMode.Always) {
    return VerificationCheckSelectionReason.Always;
  }
  if (conservative) return VerificationCheckSelectionReason.Conservative;
  if (pathMatched && ruleMatched) {
    return VerificationCheckSelectionReason.PathGlobAndRuleValidatorMatched;
  }
  if (pathMatched) return VerificationCheckSelectionReason.PathGlobMatched;
  if (ruleMatched) return VerificationCheckSelectionReason.RuleValidatorMatched;
  return VerificationCheckSelectionReason.NotImpacted;
}

function collectDiagnostics(
  checks: readonly ProjectVerificationCheck[],
  relevantRules: VerificationImpactSelectorInput["applicableRules"],
): VerificationImpactDiagnostic[] {
  return relevantRules.flatMap((rule) => {
    if (rule.enforcement !== RuleEnforcement.Blocking) return [];
    const validatorIds = rule.validatorIds
      .filter((validatorId) => !checks.some((check) => check.validatorIds.includes(validatorId)))
      .sort(compare);
    return validatorIds.length === 0
      ? []
      : [
          {
            code: VerificationImpactDiagnosticCode.BlockingRuleValidatorUnmapped,
            ruleId: rule.ruleId,
            validatorIds,
            message: `Blocking Rule ${rule.ruleId} 存在未映射的 Project Verification Validator。`,
          },
        ];
  });
}

function normalizeChangedPaths(changedPaths: readonly string[]): {
  paths: readonly string[];
  invalidPaths: readonly string[];
} {
  const paths: string[] = [];
  const invalidPaths: string[] = [];
  for (const path of changedPaths) {
    const normalized = normalizeRuleRelativePath(path);
    if (normalized.status === ResultStatus.Failure) {
      invalidPaths.push(path);
    } else {
      paths.push(normalized.value);
    }
  }
  return {
    paths: [...new Set(paths)].sort(compare),
    invalidPaths: [...new Set(invalidPaths)].sort(compare),
  };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
