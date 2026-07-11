import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import type { ParsedCliCommand } from "../contracts/index.js";
import { collectCliArguments } from "./collection/index.js";
import { parseCollectedCliArguments } from "./commands/index.js";
import { CliOptionName } from "./options/index.js";

/** 将原始 argv 确定性解析为受支持命令。 */
export function parseCliArguments(args: readonly string[]): Result<ParsedCliCommand, HarnessError> {
  try {
    return success(parseCollectedCliArguments(collectCliArguments(args)));
  } catch (error) {
    if (error instanceof HarnessError) {
      return failure(error);
    }
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Unable to parse CLI arguments.", {}, error),
    );
  }
}

/** 判断原始 argv 是否请求 JSON 错误输出。 */
export function requestsJsonOutput(args: readonly string[]): boolean {
  return args.includes(CliOptionName.Json);
}
