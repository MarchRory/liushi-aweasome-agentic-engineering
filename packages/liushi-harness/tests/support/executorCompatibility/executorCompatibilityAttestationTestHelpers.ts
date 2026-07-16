import type { ApprovalRecord, DecisionRequest } from "../../../src/domain/approval/index.js";
import {
  createExecutorCompatibilityG6ApprovalBinding,
  validateExecutorCompatibilityAttestationStatement,
} from "../../../src/domain/executorCompatibilityAttestation/index.js";

import type { ExecutorCompatibilityAttestationFixture } from "./executorCompatibilityAttestationFixture.js";

/** 使用 Fixture 的受信 Candidate 创建待测 G6 Approval Binding。 */
export function createExecutorCompatibilityG6BindingForFixture(
  fixture: ExecutorCompatibilityAttestationFixture,
  decisionRequest: DecisionRequest,
  approvalRecord: ApprovalRecord,
): ReturnType<typeof createExecutorCompatibilityG6ApprovalBinding> {
  return createExecutorCompatibilityG6ApprovalBinding(
    { releaseCandidate: fixture.releaseCandidate, decisionRequest, approvalRecord },
    fixture.digest,
  );
}

/** 使用 Fixture 的完整受信输入校验待测 in-toto Statement。 */
export function validateExecutorCompatibilityStatementForFixture(
  fixture: ExecutorCompatibilityAttestationFixture,
  statement: unknown,
): ReturnType<typeof validateExecutorCompatibilityAttestationStatement> {
  return validateExecutorCompatibilityAttestationStatement(
    statement,
    {
      bundle: fixture.bundle,
      publisherIdentityPolicy: fixture.publisherIdentityPolicy,
      releaseCandidate: fixture.releaseCandidate,
      decisionRequest: fixture.decisionRequest,
      approvalRecord: fixture.approvalRecord,
    },
    fixture.digest,
  );
}
