import { isCanonicalRepositoryRelativePath } from "#common/index.js";
import {
  MAX_ACTION_TARGET_LENGTH,
  MAX_SESSION_ACTION_TARGETS,
} from "#domain/actionJournal/index.js";

/** 验证 Journal v2 Intent.targets 符合确定性的跨平台仓库路径约束。 */
export function isCanonicalCodingTaskSessionActionTargets(
  value: unknown,
): value is readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_SESSION_ACTION_TARGETS ||
    value.some(
      (target) =>
        typeof target !== "string" ||
        target.length === 0 ||
        target.length > MAX_ACTION_TARGET_LENGTH ||
        target.trim() !== target ||
        target.includes("\0") ||
        !isCanonicalRepositoryRelativePath(target),
    )
  ) {
    return false;
  }
  return isStrictlySorted(value);
}

function isStrictlySorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}
