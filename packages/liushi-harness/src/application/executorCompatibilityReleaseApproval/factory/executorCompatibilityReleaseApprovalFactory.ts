import { ResultStatus, failure, type HarnessError, type Result } from "#common/index.js";
import type { ExecutorCompatibilityReleaseApprovalVerificationReceipt } from "#application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";

import type {
  CreateExecutorCompatibilityReleaseApprovalVerificationReceiptInput,
  ExecutorCompatibilityReleaseApprovalDigestPort,
} from "../contracts/index.js";
import { validateExecutorCompatibilityReleaseApprovalVerificationReceipt } from "../validation/index.js";

/** 创建内容寻址权威审批回执；摘要计算输入排除 receiptDigest。 */
export function createExecutorCompatibilityReleaseApprovalVerificationReceipt(
  input: CreateExecutorCompatibilityReleaseApprovalVerificationReceiptInput,
  digestPort: ExecutorCompatibilityReleaseApprovalDigestPort,
): Result<ExecutorCompatibilityReleaseApprovalVerificationReceipt, HarnessError> {
  const digest = digestPort.calculate(input);
  if (digest.status === ResultStatus.Failure) return failure(digest.error);
  const candidate = { ...input, receiptDigest: digest.value };
  return validateExecutorCompatibilityReleaseApprovalVerificationReceipt(
    {
      authorityInput: {
        approvalSubject: input.approvalSubject,
        artifactDigest: input.artifactDigest,
      },
      receipt: candidate,
      expected: {
        decisionRequest: input.decisionRequest,
        approvalRecord: input.approvalRecord,
      },
    },
    digestPort,
  );
}
