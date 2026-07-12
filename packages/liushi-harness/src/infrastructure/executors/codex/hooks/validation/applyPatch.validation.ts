import {
  HarnessError,
  HarnessErrorCode,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";

/** 解析 apply_patch Tool Input 中的仓库相对目标文件。 */
export function parseApplyPatchTargets(
  toolInput: unknown,
): Result<{ command: string; targets: readonly string[] }, HarnessErrorType> {
  if (!isRecord(toolInput) || typeof toolInput["command"] !== "string") {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "apply_patch 必须提供字符串 command。"),
    );
  }
  const command = toolInput["command"];
  const targets = command
    .replaceAll("\r\n", "\n")
    .split("\n")
    .flatMap((line) => {
      const match = /^\*\*\* (?:Update|Add|Delete|Move to) File: (.+)$/u.exec(line);
      return match?.[1] === undefined ? [] : [match[1]];
    });
  const uniqueTargets = [...new Set(targets)].sort((left, right) => left.localeCompare(right));
  return uniqueTargets.length === 0
    ? failure(new HarnessError(HarnessErrorCode.InvalidInput, "apply_patch 未声明任何目标文件。"))
    : success({ command, targets: uniqueTargets });
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
