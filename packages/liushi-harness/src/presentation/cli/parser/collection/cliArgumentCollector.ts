import {
  cliOptionRequiresValue,
  createInvalidCliOptionError,
  parseCliOptionName,
} from "../options/index.js";
import type { CliOptionName } from "../options/index.js";

/** 分离位置参数、有值选项和 Flag 后的中间结果。 */
export interface CollectedCliArguments {
  /** 非选项位置参数。 */
  positionals: string[];
  /** 有值选项。 */
  values: Map<CliOptionName, string>;
  /** 无值 Flag。 */
  flags: Set<CliOptionName>;
}

/** 将原始 argv 分离为位置参数、值选项和无值 Flag。 */
export function collectCliArguments(args: readonly string[]): CollectedCliArguments {
  const positionals: string[] = [];
  const values = new Map<CliOptionName, string>();
  const flags = new Set<CliOptionName>();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) {
      continue;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const option = parseCliOptionName(token);
    if (flags.has(option) || values.has(option)) {
      throw createInvalidCliOptionError(option, "Option cannot be repeated.");
    }
    if (!cliOptionRequiresValue(option)) {
      flags.add(option);
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--") || value.trim().length === 0) {
      throw createInvalidCliOptionError(option, "Option requires a non-empty value.");
    }
    values.set(option, value.trim());
    index += 1;
  }

  return { positionals, values, flags };
}
