import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import { validateExecutorCompatibilityReleaseG6ApprovalRecords } from "#domain/executorCompatibilityAttestation/index.js";

import {
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_EXPECTED_RECORD_MISMATCH_MESSAGE,
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_RECEIPT_DIGEST_MISMATCH_MESSAGE,
} from "../constants/index.js";
import type {
  ExecutorCompatibilityReleaseApprovalVerificationReceipt,
  ValidateExecutorCompatibilityReleaseApprovalInput,
} from "../contracts/index.js";
import { executorCompatibilityReleaseApprovalReceiptSchema } from "../schemas/index.js";

/** 严格校验权威回执、内嵌记录及其与调用方 draft 的绑定关系。 */
export function validateExecutorCompatibilityReleaseApprovalVerificationReceipt(
  input: ValidateExecutorCompatibilityReleaseApprovalInput,
  digestPort: { calculate(value: unknown): Result<ContentDigest, HarnessErrorType> },
): Result<ExecutorCompatibilityReleaseApprovalVerificationReceipt, HarnessErrorType> {
  const parsed = executorCompatibilityReleaseApprovalReceiptSchema.safeParse(input.receipt);
  if (!parsed.success) {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "权威审批回执 Schema 无效。"));
  }
  const receipt = parsed.data as ExecutorCompatibilityReleaseApprovalVerificationReceipt;
  if (
    receipt.approvalSubject !== input.authorityInput.approvalSubject ||
    receipt.artifactDigest !== input.authorityInput.artifactDigest
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        "权威审批回执未精确绑定调用方审批主体。",
      ),
    );
  }
  if (
    receipt.decisionRequestDigest !== receipt.decisionRequest.digest ||
    receipt.approvalRecordDigest !== receipt.approvalRecord.digest
  ) {
    return failure(
      new HarnessError(HarnessErrorCode.PreconditionNotMet, "权威审批回执未绑定其完整审批记录。"),
    );
  }
  const g6 = validateExecutorCompatibilityReleaseG6ApprovalRecords(
    {
      artifactDigest: receipt.artifactDigest,
      decisionRequest: receipt.decisionRequest,
      approvalRecord: receipt.approvalRecord,
      approvalSubject: receipt.approvalSubject,
    },
    digestPort,
  );
  if (g6.status === ResultStatus.Failure) return g6;
  const expectedG6 = validateExecutorCompatibilityReleaseG6ApprovalRecords(
    {
      artifactDigest: input.authorityInput.artifactDigest,
      decisionRequest: input.expected.decisionRequest,
      approvalRecord: input.expected.approvalRecord,
      approvalSubject: input.authorityInput.approvalSubject,
    },
    digestPort,
  );
  if (expectedG6.status === ResultStatus.Failure) return expectedG6;
  if (
    g6.value.decisionRequest.digest !== expectedG6.value.decisionRequest.digest ||
    g6.value.approvalRecord.digest !== expectedG6.value.approvalRecord.digest
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_EXPECTED_RECORD_MISMATCH_MESSAGE,
      ),
    );
  }
  const receiptDigestInput = withoutReceiptDigest(receipt);
  const receiptDigest = digestPort.calculate(receiptDigestInput);
  if (receiptDigest.status === ResultStatus.Failure) return receiptDigest;
  if (receiptDigest.value !== receipt.receiptDigest) {
    return failure(
      new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_RECEIPT_DIGEST_MISMATCH_MESSAGE,
      ),
    );
  }
  return success(receipt);
}

function withoutReceiptDigest(
  receipt: ExecutorCompatibilityReleaseApprovalVerificationReceipt,
): Record<string, unknown> {
  const { receiptDigest, ...receiptDigestInput } = receipt;
  void receiptDigest;
  return receiptDigestInput;
}
