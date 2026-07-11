import { RuleResolutionStatus, type ApplicableRuleBundle } from "#domain/rule/index.js";

/** 判断 Rule Bundle 是否因冲突、漂移或缺失要求而不可执行。 */
export function isRuleResolutionBlocked(bundle: ApplicableRuleBundle): boolean {
  return bundle.resolutionStatus === RuleResolutionStatus.Blocked;
}
