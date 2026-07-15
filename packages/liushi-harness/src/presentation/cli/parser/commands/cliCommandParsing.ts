import type { CollectedCliArguments } from "../collection/index.js";
import { createInvalidCliOptionError } from "../options/index.js";
import type { CliOptionName } from "../options/index.js";

/** 验证命令未携带其语义不允许的选项。 */
export function validateAllowedCliOptions(
  collected: CollectedCliArguments,
  allowed: ReadonlySet<CliOptionName>,
): void {
  for (const option of [...collected.flags, ...collected.values.keys()]) {
    if (!allowed.has(option)) {
      throw createInvalidCliOptionError(option, "Option is not valid for this command.");
    }
  }
}

/** 获取必须存在的带值选项。 */
export function requireCliOptionValue(
  collected: CollectedCliArguments,
  option: CliOptionName,
): string {
  const value = collected.values.get(option);
  if (value === undefined) {
    throw createInvalidCliOptionError(option, "Required option is missing.");
  }
  return value;
}

/** 判断位置参数是否精确匹配一个规范命令。 */
export function isExactCliCommand(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}
