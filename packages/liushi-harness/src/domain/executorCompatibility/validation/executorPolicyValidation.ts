import { failure, HarnessError, HarnessErrorCode, success, type Result } from "#common/index.js";

import type {
  ExecutorCompatibilityPolicy,
  ExecutorHostScope,
  ExecutorSupportTierPolicy,
} from "../contracts/index.js";
import { requirementIdentity } from "../digest/index.js";
import { ExecutorAdapterKind, ExecutorDistribution, ExecutorSupportLevel } from "../enums/index.js";
import { hasDuplicateQualifiers } from "../utils/index.js";

/** 校验 Adapter/Distribution 配对和 Policy Tier 单调性。 */
export function validateExecutorCompatibilityPolicy(
  policy: ExecutorCompatibilityPolicy,
): Result<void, HarnessError> {
  const levels = policy.tiers.map((tier) => tier.level);
  if (
    levels.length !== 2 ||
    !levels.includes(ExecutorSupportLevel.Production) ||
    !levels.includes(ExecutorSupportLevel.Compatible)
  ) {
    return invalid("Executor compatibility policy must define production and compatible tiers.");
  }

  for (const tier of policy.tiers) {
    const tierCheck = validateTier(tier);
    if (tierCheck !== undefined) return invalid(tierCheck);
  }
  const production = policy.tiers.find((tier) => tier.level === ExecutorSupportLevel.Production);
  const compatible = policy.tiers.find((tier) => tier.level === ExecutorSupportLevel.Compatible);
  if (production === undefined || compatible === undefined) {
    return invalid("Executor compatibility policy tiers are incomplete.");
  }
  const monotonic = validateTierMonotonicity(production, compatible);
  return monotonic === undefined ? success(undefined) : invalid(monotonic);
}

/** 校验 Host Scope 不能把实际产品发行版伪装成其他 Adapter。 */
export function validateExecutorHostScopePairing(
  scope: ExecutorHostScope,
): Result<void, HarnessError> {
  const valid =
    (scope.adapterKind === ExecutorAdapterKind.Codex &&
      scope.distribution === ExecutorDistribution.CodexCli) ||
    (scope.adapterKind === ExecutorAdapterKind.ClaudeCompatible &&
      (scope.distribution === ExecutorDistribution.ClaudeCode ||
        scope.distribution === ExecutorDistribution.CatPaw)) ||
    (scope.adapterKind === ExecutorAdapterKind.GenericCli &&
      scope.distribution === ExecutorDistribution.GenericCli);
  return valid
    ? success(undefined)
    : invalid("Executor adapter kind and distribution are incompatible.");
}

function validateTier(tier: ExecutorSupportTierPolicy): string | undefined {
  if (
    tier.level !== ExecutorSupportLevel.Production &&
    tier.level !== ExecutorSupportLevel.Compatible
  ) {
    return "Executor compatibility policy contains a non-declarable tier.";
  }
  const requirementIds = tier.requirements.map(requirementIdentity);
  if (new Set(requirementIds).size !== requirementIds.length) {
    return "Executor compatibility tier contains duplicate capability requirements.";
  }
  for (const requirement of tier.requirements) {
    if (hasDuplicateQualifiers(requirement.qualifiers)) {
      return "Executor compatibility requirement contains duplicate qualifiers.";
    }
    if (new Set(requirement.evidenceKinds).size !== requirement.evidenceKinds.length) {
      return "Executor compatibility requirement contains duplicate evidence kinds.";
    }
  }
  return undefined;
}

function validateTierMonotonicity(
  production: ExecutorSupportTierPolicy,
  compatible: ExecutorSupportTierPolicy,
): string | undefined {
  if (
    (compatible.scopeRequirements.modelId && !production.scopeRequirements.modelId) ||
    (compatible.scopeRequirements.permissionMode && !production.scopeRequirements.permissionMode) ||
    (compatible.scopeRequirements.configurationDigest &&
      !production.scopeRequirements.configurationDigest)
  ) {
    return "Production scope requirements must include compatible scope requirements.";
  }
  const productionByRequirement = new Map(
    production.requirements.map((requirement) => [requirementIdentity(requirement), requirement]),
  );
  let hasStricterRequirement =
    production.scopeRequirements.modelId !== compatible.scopeRequirements.modelId ||
    production.scopeRequirements.permissionMode !== compatible.scopeRequirements.permissionMode ||
    production.scopeRequirements.configurationDigest !==
      compatible.scopeRequirements.configurationDigest ||
    production.requirements.length > compatible.requirements.length;
  for (const compatibleRequirement of compatible.requirements) {
    const productionRequirement = productionByRequirement.get(
      requirementIdentity(compatibleRequirement),
    );
    if (productionRequirement === undefined) {
      return "Production capability requirements must include compatible requirements.";
    }
    const productionKinds = new Set(productionRequirement.evidenceKinds);
    if (!compatibleRequirement.evidenceKinds.every((kind) => productionKinds.has(kind))) {
      return "Production evidence requirements must include compatible evidence requirements.";
    }
    if (productionRequirement.evidenceKinds.length > compatibleRequirement.evidenceKinds.length) {
      hasStricterRequirement = true;
    }
  }
  return hasStricterRequirement
    ? undefined
    : "Production tier must be strictly stronger than compatible tier.";
}

function invalid(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
