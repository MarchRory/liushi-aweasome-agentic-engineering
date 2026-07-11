import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { APPROVAL_ULID_PATTERN } from "./approvalConstants.js";

declare const decisionRequestIdBrand: unique symbol;
declare const approvalIdBrand: unique symbol;

/** 经 ULID 格式校验的 Decision Request ID。 */
export type DecisionRequestId = string & { readonly [decisionRequestIdBrand]: true };

/** 经 ULID 格式校验的 Approval ID。 */
export type ApprovalId = string & { readonly [approvalIdBrand]: true };

/** 将外部字符串校验并转换为 Decision Request ID。 */
export function parseDecisionRequestId(value: string): Result<DecisionRequestId, HarnessError> {
  if (!APPROVAL_ULID_PATTERN.test(value)) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Decision Request ID must be an uppercase ULID.",
        { field: "decisionRequestId" },
      ),
    );
  }

  return success(value as DecisionRequestId);
}

/** 将外部字符串校验并转换为 Approval ID。 */
export function parseApprovalId(value: string): Result<ApprovalId, HarnessError> {
  if (!APPROVAL_ULID_PATTERN.test(value)) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Approval ID must be an uppercase ULID.", {
        field: "approvalId",
      }),
    );
  }

  return success(value as ApprovalId);
}
