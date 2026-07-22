import { createExecutorCompatibilityReleaseApprovalVerificationReceipt } from "../../../src/application/executorCompatibilityReleaseApproval/factory/index.js";
import type { ExecutorCompatibilityReleaseApprovalDigestPort } from "../../../src/application/executorCompatibilityReleaseApproval/contracts/index.js";
import type {
  ExecutorCompatibilityReleaseApprovalAuthorityInput,
  ExecutorCompatibilityReleaseApprovalAuthorityPort,
  ExecutorCompatibilityReleaseApprovalVerificationReceipt,
} from "../../../src/application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";
import { EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_VERIFICATION_RECEIPT_SCHEMA_VERSION } from "../../../src/application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "../../../src/common/index.js";
import type { ApprovalRecord, DecisionRequest } from "../../../src/domain/approval/index.js";
import type { ExecutorCompatibilityReleaseApprovalSubject } from "../../../src/domain/executorCompatibilityAttestation/index.js";

/** 测试 Authority 构造时预置的可信审批定义。 */
export interface ExecutorCompatibilityTrustedApprovalDefinition {
  readonly approvalSubject: ExecutorCompatibilityReleaseApprovalSubject;
  readonly artifactDigest: ContentDigest;
  readonly decisionRequest: DecisionRequest;
  readonly approvalRecord: ApprovalRecord;
}

const TEST_AUTHORITY_ID = "test-trusted-release-authority";

/** 从构造期可信定义创建只按主题与摘要查询的测试 Authority。 */
export function createExecutorCompatibilityTrustedApprovalAuthority(
  definitions: readonly ExecutorCompatibilityTrustedApprovalDefinition[],
  digest: ExecutorCompatibilityReleaseApprovalDigestPort,
  queries: ExecutorCompatibilityReleaseApprovalAuthorityInput[] = [],
): ExecutorCompatibilityReleaseApprovalAuthorityPort {
  const receipts = new Map<string, ExecutorCompatibilityReleaseApprovalVerificationReceipt>();
  for (const definition of definitions) {
    const authorityEvidenceId = createAuthorityEvidenceId(definition);
    const authorityEvidenceDigest = digest.calculate({
      approvalSubject: definition.approvalSubject,
      artifactDigest: definition.artifactDigest,
      decisionRequest: definition.decisionRequest,
      approvalRecord: definition.approvalRecord,
    });
    if (authorityEvidenceDigest.status === ResultStatus.Failure) {
      throw authorityEvidenceDigest.error;
    }
    const receipt = createExecutorCompatibilityReleaseApprovalVerificationReceipt(
      {
        schemaVersion: EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_VERIFICATION_RECEIPT_SCHEMA_VERSION,
        authorityId: TEST_AUTHORITY_ID,
        authorityEvidenceId,
        authorityEvidenceDigest: authorityEvidenceDigest.value,
        approvalSubject: definition.approvalSubject,
        artifactDigest: definition.artifactDigest,
        decisionRequestDigest: definition.decisionRequest.digest,
        approvalRecordDigest: definition.approvalRecord.digest,
        decisionRequest: definition.decisionRequest,
        approvalRecord: definition.approvalRecord,
      },
      digest,
    );
    if (receipt.status === ResultStatus.Failure) throw receipt.error;
    receipts.set(
      createAuthorityKey(definition.approvalSubject, definition.artifactDigest),
      receipt.value,
    );
  }

  return {
    verifyTrustedApproval(
      input: ExecutorCompatibilityReleaseApprovalAuthorityInput,
    ): Promise<Result<ExecutorCompatibilityReleaseApprovalVerificationReceipt, HarnessError>> {
      queries.push(input);
      const receipt = receipts.get(createAuthorityKey(input.approvalSubject, input.artifactDigest));
      if (receipt === undefined) {
        return Promise.resolve(
          failure(
            new HarnessError(
              HarnessErrorCode.PreconditionNotMet,
              "测试 Authority 未找到精确匹配的可信审批。",
            ),
          ),
        );
      }
      return Promise.resolve(success(receipt));
    },
  };
}

/** 创建稳定拒绝所有查询的测试 Authority。 */
export function createExecutorCompatibilityUnavailableReleaseApprovalAuthority(): ExecutorCompatibilityReleaseApprovalAuthorityPort {
  return {
    verifyTrustedApproval(): Promise<Result<never, HarnessError>> {
      return Promise.resolve(
        failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, "测试 Authority 不可用。")),
      );
    },
  };
}

function createAuthorityKey(
  approvalSubject: ExecutorCompatibilityReleaseApprovalSubject,
  artifactDigest: ContentDigest,
): string {
  return `${approvalSubject}|${artifactDigest}`;
}

function createAuthorityEvidenceId(
  definition: ExecutorCompatibilityTrustedApprovalDefinition,
): string {
  return `trusted-approval-${definition.approvalSubject}-${definition.artifactDigest.replace(":", "-")}`;
}
