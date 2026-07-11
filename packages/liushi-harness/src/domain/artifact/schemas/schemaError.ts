import { type ZodError } from "zod";

import { HarnessError, HarnessErrorCode } from "#common/index.js";

/** 灏?Zod Error 杞崲涓虹ǔ瀹氱殑 Artifact 杈撳叆閿欒銆?*/
export function createArtifactSchemaError(error: ZodError, message: string): HarnessError {
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
