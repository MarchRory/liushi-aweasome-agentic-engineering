import { type ZodError } from "zod";

import { HarnessError, HarnessErrorCode } from "#common/index.js";

/** 将 Zod Error 转换为 fail-closed Store Schema Error。 */
export function createPersistenceSchemaError(label: string, error: ZodError): HarnessError {
  const issue = error.issues[0];
  return new HarnessError(
    HarnessErrorCode.CorruptStore,
    `${label} does not match the supported schema.`,
    {
      path: issue?.path.join(".") ?? "unknown",
      issue: issue?.message ?? "unknown",
    },
    error,
  );
}
