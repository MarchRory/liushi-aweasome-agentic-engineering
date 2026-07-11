import type { ZodError } from "zod";

import { HarnessError, HarnessErrorCode } from "#common/index.js";

/** 将 Zod Error 转换为稳定的 Project Discovery 输入错误。 */
export function createProjectDiscoverySchemaError(error: ZodError, message: string): HarnessError {
  const issue = error.issues[0];
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    message,
    {
      path: issue?.path.join(".") ?? "unknown",
      issue: issue?.message ?? "unknown",
    },
    error,
  );
}
