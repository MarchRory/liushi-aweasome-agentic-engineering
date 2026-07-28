import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { APPROVAL_ULID_PATTERN } from "../constants/index.js";
import type { ApprovalId, DecisionRequestId } from "../contracts/index.js";

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
