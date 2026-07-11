import { minimatch, type MinimatchOptions } from "minimatch";

import type {
  RuleResolutionContext,
  RuleResolutionTarget,
  RuleScope,
  RuleSelector,
} from "../contracts/index.js";
import { RuleScopeLevel } from "../enums/index.js";
import { isPathWithinPrefix } from "../path/index.js";

const RULE_MINIMATCH_OPTIONS: MinimatchOptions = {
  dot: true,
  nocase: false,
  nocomment: true,
  nonegate: true,
  noext: true,
  nobrace: true,
};

/** 返回 Rule Scope 在当前显式 Context 中覆盖的目标集合。 */
export function selectTargetsByRuleScope(
  scope: RuleScope,
  context: RuleResolutionContext,
): readonly RuleResolutionTarget[] {
  switch (scope.level) {
    case RuleScopeLevel.Harness:
      return context.targets;
    case RuleScopeLevel.Organization:
      return context.workspaceRef.organizationId === scope.organizationId ? context.targets : [];
    case RuleScopeLevel.Workspace:
      return context.workspaceRef.workspaceId === scope.workspaceId ? context.targets : [];
    case RuleScopeLevel.Repository:
      return context.workspaceRef.workspaceId === scope.workspaceId
        ? context.targets.filter((target) => target.repositoryId === scope.repositoryId)
        : [];
    case RuleScopeLevel.Path:
      return context.workspaceRef.workspaceId === scope.workspaceId
        ? context.targets.filter(
            (target) =>
              target.repositoryId === scope.repositoryId &&
              isPathWithinPrefix(target.relativePath, scope.pathPrefix),
          )
        : [];
    case RuleScopeLevel.Task:
      return context.workspaceRef.workspaceId === scope.workspaceId &&
        context.taskId === scope.taskId
        ? context.targets
        : [];
  }
}

/** 判断单个显式目标是否满足 Rule Selector 的全部维度。 */
export function matchesRuleSelector(selector: RuleSelector, target: RuleResolutionTarget): boolean {
  return (
    matchesOptional(selector.repositoryIds, target.repositoryId) &&
    matchesPathGlobs(selector.pathGlobs, target.relativePath) &&
    matchesOptional(selector.languages, target.language) &&
    matchesOptional(selector.fileKinds, target.fileKind) &&
    matchesOptional(selector.operations, target.operation)
  );
}

function matchesOptional<T>(allowed: readonly T[] | undefined, actual: T): boolean {
  return allowed === undefined || allowed.includes(actual);
}

function matchesPathGlobs(pathGlobs: readonly string[] | undefined, relativePath: string): boolean {
  return (
    pathGlobs === undefined ||
    pathGlobs.some((pathGlob) => minimatch(relativePath, pathGlob, RULE_MINIMATCH_OPTIONS))
  );
}
