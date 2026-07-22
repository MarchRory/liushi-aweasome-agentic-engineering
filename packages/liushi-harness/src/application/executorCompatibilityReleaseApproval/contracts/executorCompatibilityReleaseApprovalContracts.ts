import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { ApprovalRecord, DecisionRequest } from "#domain/approval/index.js";
import type {
  ExecutorCompatibilityReleaseApprovalAuthorityInput,
  ExecutorCompatibilityReleaseApprovalVerificationReceipt,
} from "#application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";

/** 创建回执时除去自身摘要的规范化输入。 */
export type ExecutorCompatibilityReleaseApprovalVerificationReceiptDigestInput = Omit<
  ExecutorCompatibilityReleaseApprovalVerificationReceipt,
  "receiptDigest"
>;

/** 创建权威审批回执的纯输入。 */
export type CreateExecutorCompatibilityReleaseApprovalVerificationReceiptInput =
  ExecutorCompatibilityReleaseApprovalVerificationReceiptDigestInput;

/** 校验回执时的调用方 draft 期望记录。 */
export interface ExecutorCompatibilityReleaseApprovalExpectedRecords {
  /** 待签名 Draft 已经完成领域复验的 DecisionRequest。 */
  readonly decisionRequest: DecisionRequest;
  /** 待签名 Draft 已经完成领域复验的 ApprovalRecord。 */
  readonly approvalRecord: ApprovalRecord;
}

/** 校验 Authority 回执并绑定调用方 draft 的输入。 */
export interface ValidateExecutorCompatibilityReleaseApprovalInput {
  /** 实际发送给 Authority 的最小查询条件。 */
  readonly authorityInput: ExecutorCompatibilityReleaseApprovalAuthorityInput;
  /** Authority 返回且尚未被 Application 信任的回执。 */
  readonly receipt: unknown;
  /** 回执中的权威记录必须精确匹配的待签名 Draft 记录。 */
  readonly expected: ExecutorCompatibilityReleaseApprovalExpectedRecords;
}

/** Application 层校验使用的摘要端口。 */
export interface ExecutorCompatibilityReleaseApprovalDigestPort {
  /** 对 JSON-compatible 输入计算规范内容摘要。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}

export type { ExecutorCompatibilityReleaseApprovalVerificationReceipt } from "#application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";
