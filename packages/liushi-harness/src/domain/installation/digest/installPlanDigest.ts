import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { InstallPlan } from "../contracts/index.js";

/** 计算 InstallPlan 时排除摘要自身，确保重放可验证。 */
export function calculateInstallPlanDigest(
  calculate: (input: unknown) => Result<ContentDigest, HarnessError>,
  plan: Omit<InstallPlan, "planDigest">,
): Result<ContentDigest, HarnessError> {
  return calculate(plan);
}
