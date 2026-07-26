import type { z } from "zod";

import { HarnessError, HarnessErrorCode, failure, type Result } from "#common/index.js";

/** 从未知 Hook Payload 读取版本判别字段。 */
export function readHookSchemaVersion(input: unknown): unknown {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)["schemaVersion"]
    : undefined;
}

/** 判断文件目标是否为规范仓库相对 POSIX 路径。 */
export function isRepositoryRelativePath(value: string): boolean {
  if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** 将首个 Zod 问题映射为稳定 Hook 输入错误。 */
export function invalidHookPayload<T>(error: z.ZodError): Result<T, HarnessError> {
  const issue = error.issues[0];
  return failure(
    new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Canonical Hook Payload 无效。",
      { path: issue?.path.join(".") ?? "unknown", issue: issue?.message ?? "unknown" },
      error,
    ),
  );
}
