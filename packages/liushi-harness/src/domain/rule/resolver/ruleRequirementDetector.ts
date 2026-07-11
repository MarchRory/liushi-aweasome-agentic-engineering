import type {
  ApplicableRuleEntry,
  MissingRuleCapability,
  MissingRuleValidator,
  RuleDefinitionViolation,
} from "../contracts/index.js";
import { RuleDefinitionViolationKind, RuleEnforcement } from "../enums/index.js";
import { compareRuleStrings } from "./ruleResolutionOrdering.js";

/** 对 Applicable Rule 重复执行不能仅依赖 Schema 的关键安全不变量。 */
export function detectRuleDefinitionViolations(
  rules: readonly ApplicableRuleEntry[],
): readonly RuleDefinitionViolation[] {
  return rules
    .filter(
      (rule) => rule.enforcement === RuleEnforcement.Blocking && rule.validatorIds.length === 0,
    )
    .map((rule) => ({
      kind: RuleDefinitionViolationKind.BlockingValidatorMissing,
      ruleId: rule.ruleId,
      version: rule.version,
      message: "Blocking rule requires at least one deterministic validator.",
    }))
    .sort((left, right) =>
      compareRuleStrings(`${left.ruleId}@${left.version}`, `${right.ruleId}@${right.version}`),
    );
}

/** 返回 Blocking Rule 需要但当前运行环境未注册的 Validator。 */
export function detectMissingRuleValidators(
  rules: readonly ApplicableRuleEntry[],
  availableValidatorIds: readonly string[],
): readonly MissingRuleValidator[] {
  const available = new Set(availableValidatorIds);
  return rules
    .flatMap((rule) =>
      rule.enforcement === RuleEnforcement.Blocking
        ? rule.validatorIds
            .filter((validatorId) => !available.has(validatorId))
            .map((validatorId) => ({
              ruleId: rule.ruleId,
              validatorId,
              targetIds: rule.matchedTargetIds,
            }))
        : [],
    )
    .sort((left, right) =>
      compareRuleStrings(
        `${left.ruleId}:${left.validatorId}`,
        `${right.ruleId}:${right.validatorId}`,
      ),
    );
}

/** 返回 Applicable Rule 需要但当前运行环境未注册的 Capability。 */
export function detectMissingRuleCapabilities(
  rules: readonly ApplicableRuleEntry[],
  availableCapabilityIds: readonly string[],
): readonly MissingRuleCapability[] {
  const available = new Set(availableCapabilityIds);
  return rules
    .flatMap((rule) =>
      rule.requiredCapabilityIds
        .filter((capabilityId) => !available.has(capabilityId))
        .map((capabilityId) => ({
          ruleId: rule.ruleId,
          capabilityId,
          enforcement: rule.enforcement,
          targetIds: rule.matchedTargetIds,
        })),
    )
    .sort((left, right) =>
      compareRuleStrings(
        `${left.ruleId}:${left.capabilityId}`,
        `${right.ruleId}:${right.capabilityId}`,
      ),
    );
}
