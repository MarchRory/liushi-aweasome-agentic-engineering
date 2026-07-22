import { ExecutorSupportLevel } from "#domain/executorCompatibility/index.js";

/** Trust Profile 允许声明的公开支持等级。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_TRUST_ALLOWED_SUPPORT_LEVELS = [
  ExecutorSupportLevel.Production,
  ExecutorSupportLevel.Compatible,
  ExecutorSupportLevel.Experimental,
] as const;

/** 判断等级是否属于 Trust Profile 的关闭式允许集合。 */
export function isExecutorCompatibilityReleaseTrustSupportLevel(
  level: ExecutorSupportLevel,
): boolean {
  return EXECUTOR_COMPATIBILITY_RELEASE_TRUST_ALLOWED_SUPPORT_LEVELS.includes(
    level as (typeof EXECUTOR_COMPATIBILITY_RELEASE_TRUST_ALLOWED_SUPPORT_LEVELS)[number],
  );
}

/** 返回支持等级的强度排序，Production 的强度最高。 */
export function getExecutorCompatibilitySupportLevelRank(level: ExecutorSupportLevel): number {
  switch (level) {
    case ExecutorSupportLevel.Production:
      return 3;
    case ExecutorSupportLevel.Compatible:
      return 2;
    case ExecutorSupportLevel.Experimental:
      return 1;
    case ExecutorSupportLevel.Unsupported:
    case ExecutorSupportLevel.Unverified:
      return 0;
  }
}

/** 判断实际支持等级是否达到 Profile 声明的最低等级。 */
export function isExecutorCompatibilitySupportLevelAtLeast(
  actual: ExecutorSupportLevel,
  minimum: ExecutorSupportLevel,
): boolean {
  if (
    !isExecutorCompatibilityReleaseTrustSupportLevel(actual) ||
    !isExecutorCompatibilityReleaseTrustSupportLevel(minimum)
  ) {
    return false;
  }
  return (
    getExecutorCompatibilitySupportLevelRank(actual) >=
    getExecutorCompatibilitySupportLevelRank(minimum)
  );
}
