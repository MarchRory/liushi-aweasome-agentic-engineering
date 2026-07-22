import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { DecisionRequest, ApprovalRecord } from "#domain/approval/index.js";
import type { ExecutorCompatibilityReleaseApprovalSubject } from "#domain/executorCompatibilityAttestation/index.js";

import type { EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_VERIFICATION_RECEIPT_SCHEMA_VERSION } from "../constants/index.js";

/** Authority 仅凭审批主体与其内容摘要定位可信审批。 */
export interface ExecutorCompatibilityReleaseApprovalAuthorityInput {
  /** 待查询的是 Release Candidate 还是 Release Manifest 审批。 */
  readonly approvalSubject: ExecutorCompatibilityReleaseApprovalSubject;
  /** Authority 必须从可信源定位的精确制品摘要。 */
  readonly artifactDigest: ContentDigest;
}

/** 权威审批验证成功后返回的、内容寻址的回执。 */
export interface ExecutorCompatibilityReleaseApprovalVerificationReceipt {
  /** 权威审批回执的固定契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_VERIFICATION_RECEIPT_SCHEMA_VERSION;
  /** 可信审批源或适配器的稳定标识。 */
  readonly authorityId: string;
  /** Authority 内可用于追溯真实审批证据的稳定标识。 */
  readonly authorityEvidenceId: string;
  /** Authority 对原始审批证据计算的内容摘要。 */
  readonly authorityEvidenceDigest: ContentDigest;
  /** 权威记录批准的封闭发布主体。 */
  readonly approvalSubject: ExecutorCompatibilityReleaseApprovalSubject;
  /** 权威记录批准的精确制品摘要。 */
  readonly artifactDigest: ContentDigest;
  /** 权威 DecisionRequest 的自身摘要。 */
  readonly decisionRequestDigest: ContentDigest;
  /** 权威 ApprovalRecord 的自身摘要。 */
  readonly approvalRecordDigest: ContentDigest;
  /** Authority 从可信源读取并完整复验的 DecisionRequest。 */
  readonly decisionRequest: DecisionRequest;
  /** Authority 从可信源读取并完整复验的 ApprovalRecord。 */
  readonly approvalRecord: ApprovalRecord;
  /** 排除自身后对完整回执计算的规范内容摘要。 */
  readonly receiptDigest: ContentDigest;
}

/** Executor Compatibility Release G6 可信审批源的 Port。 */
export interface ExecutorCompatibilityReleaseApprovalAuthorityPort {
  /** 仅按审批主体和制品摘要查询可信源，不接收调用方自带的审批记录。 */
  verifyTrustedApproval(
    input: ExecutorCompatibilityReleaseApprovalAuthorityInput,
  ): Promise<Result<ExecutorCompatibilityReleaseApprovalVerificationReceipt, HarnessError>>;
}
