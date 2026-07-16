import type { ZodError } from "zod";

import { HarnessError, HarnessErrorCode, failure, type Result } from "#common/index.js";

/** 将严格 Schema 错误映射为稳定的 Harness InvalidInput。 */
export function invalidAttestationSchema(
  error: ZodError,
  message: string,
): Result<never, HarnessError> {
  const issue = error.issues[0];
  return invalidAttestationInput(message, {
    path: issue?.path.join(".") ?? "unknown",
    issue: issue?.message ?? "unknown",
  });
}

/** 创建表示受信绑定不再成立的稳定错误。 */
export function attestationBindingMismatch(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, message));
}

/** 创建表示 Attestation 输入结构或规范化语义非法的稳定错误。 */
export function invalidAttestationInput(
  message: string,
  details: Readonly<Record<string, string>> = {},
): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, details));
}
