import type {
  ExecutorCapabilityAssessment,
  ExecutorHostScope,
  ExecutorSupportTierAssessment,
  ExecutorSupportTierPolicy,
} from "../contracts/index.js";
import { requirementIdentity } from "../digest/index.js";
import {
  ExecutorRequirementStatus,
  ExecutorScopeField,
  ExecutorSupportLevel,
} from "../enums/index.js";

/** 汇总每个可声明 Tier 的 Scope 与 Requirement 状态。 */
export function assessExecutorSupportTiers(
  scope: ExecutorHostScope,
  tiers: readonly ExecutorSupportTierPolicy[],
  capabilities: readonly ExecutorCapabilityAssessment[],
): readonly ExecutorSupportTierAssessment[] {
  return tiers
    .map((tier) => assessTier(scope, tier, capabilities))
    .sort((left, right) => tierRank(left.level) - tierRank(right.level));
}

/** 从最高已满足 Tier 计算支持等级。 */
export function highestSatisfiedTier(
  tiers: readonly ExecutorSupportTierAssessment[],
): ExecutorSupportLevel | undefined {
  return tiers.find((tier) => tier.satisfied)?.level;
}

function assessTier(
  scope: ExecutorHostScope,
  tier: ExecutorSupportTierPolicy,
  capabilities: readonly ExecutorCapabilityAssessment[],
): ExecutorSupportTierAssessment {
  const missingScopeFields = collectMissingScopeFields(scope, tier);
  const unsatisfiedRequirementIds = tier.requirements.flatMap((requirement) => {
    const capability = capabilities.find(
      (item) => requirementIdentity(item) === requirementIdentity(requirement),
    );
    const assessment = capability?.requirements.find((item) => item.level === tier.level);
    return assessment?.status === ExecutorRequirementStatus.Satisfied
      ? []
      : [requirementIdentity(requirement)];
  });
  return {
    level: tier.level,
    satisfied: missingScopeFields.length === 0 && unsatisfiedRequirementIds.length === 0,
    missingScopeFields,
    unsatisfiedRequirementIds: [...unsatisfiedRequirementIds].sort(compare),
  };
}

function collectMissingScopeFields(
  scope: ExecutorHostScope,
  tier: ExecutorSupportTierPolicy,
): readonly ExecutorScopeField[] {
  const missing: ExecutorScopeField[] = [];
  if (tier.scopeRequirements.modelId && scope.modelId === undefined) {
    missing.push(ExecutorScopeField.ModelId);
  }
  if (tier.scopeRequirements.permissionMode && scope.permissionMode === undefined) {
    missing.push(ExecutorScopeField.PermissionMode);
  }
  if (tier.scopeRequirements.configurationDigest && scope.configurationDigest === undefined) {
    missing.push(ExecutorScopeField.ConfigurationDigest);
  }
  return missing.sort(compare);
}

function tierRank(level: ExecutorSupportLevel): number {
  if (level === ExecutorSupportLevel.Production) return 0;
  if (level === ExecutorSupportLevel.Compatible) return 1;
  return 2;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
