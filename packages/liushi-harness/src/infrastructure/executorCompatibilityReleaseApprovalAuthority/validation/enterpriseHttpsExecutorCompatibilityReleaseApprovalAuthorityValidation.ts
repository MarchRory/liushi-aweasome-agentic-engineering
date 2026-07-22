import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import {
  type ExecutorCompatibilityReleaseApprovalAuthorityInput,
  executorCompatibilityReleaseApprovalAuthorityIdSchema,
  executorCompatibilityReleaseApprovalAuthorityInputSchema,
} from "#application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";

import type { EnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityConfiguration } from "../contracts/index.js";

/** 校验企业 HTTPS Authority 的构造参数并返回固定 endpoint。 */
export function validateEnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityConfiguration(
  input: EnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityConfiguration,
): Result<{ readonly endpoint: URL; readonly authorityId: string }, HarnessError> {
  let endpoint: URL;
  try {
    endpoint = new URL(input.endpoint);
  } catch {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "Authority endpoint 无效。"));
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.search !== "" ||
    endpoint.hash !== ""
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Authority endpoint 必须是无凭据、无查询参数和无片段的 HTTPS URL。",
      ),
    );
  }

  if (!executorCompatibilityReleaseApprovalAuthorityIdSchema.safeParse(input.authorityId).success) {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "Authority 标识无效。"));
  }
  if (input.bearerToken.length === 0 || /[\s\p{Cc}]/u.test(input.bearerToken)) {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "Bearer 凭据无效。"));
  }
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0) {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "Authority 超时必须为正整数。"));
  }

  return success({ endpoint, authorityId: input.authorityId });
}

/** 校验 Authority 查询输入，确保联网前拒绝未知字段和无效摘要。 */
export function validateEnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityInput(
  input: unknown,
): Result<ExecutorCompatibilityReleaseApprovalAuthorityInput, HarnessError> {
  const parsed = executorCompatibilityReleaseApprovalAuthorityInputSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data)
    : failure(new HarnessError(HarnessErrorCode.InvalidInput, "Authority 查询输入无效。"));
}
