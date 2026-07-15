import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

declare const installPlanIdBrand: unique symbol;

/** 经路径安全校验的 InstallPlan ULID 标识。 */
export type InstallPlanId = string & { readonly [installPlanIdBrand]: true };

/** 将外部值校验为 InstallPlan ID。 */
export function parseInstallPlanId(value: string): Result<InstallPlanId, HarnessError> {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/u.test(value)
    ? success(value as InstallPlanId)
    : failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "InstallPlan ID must be a ULID.", {
          field: "planId",
        }),
      );
}
