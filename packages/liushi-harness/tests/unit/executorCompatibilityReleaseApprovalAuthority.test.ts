import { describe, expect, it } from "vitest";

import {
  createExecutorCompatibilityReleaseApprovalVerificationReceipt,
  validateExecutorCompatibilityReleaseApprovalVerificationReceipt,
} from "../../src/application/executorCompatibilityReleaseApproval/index.js";
import { ExecutorCompatibilityReleaseApprovalSubject } from "../../src/domain/executorCompatibilityAttestation/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  createExecutorCompatibilityAttestationFixture,
  createExecutorCompatibilityTrustedApprovalAuthority,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Release Approval Authority", () => {
  it("只按审批主体和制品摘要查询可信审批，不接受调用输入中的记录", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const authority = createExecutorCompatibilityTrustedApprovalAuthority(
      [
        {
          approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
          artifactDigest: fixture.releaseCandidate.candidateDigest,
          decisionRequest: fixture.decisionRequest,
          approvalRecord: fixture.approvalRecord,
        },
      ],
      fixture.digest,
    );

    const valid = await authority.verifyTrustedApproval({
      approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
      artifactDigest: fixture.releaseCandidate.candidateDigest,
    });
    expect(valid.status).toBe(ResultStatus.Success);
    if (valid.status === ResultStatus.Failure) throw valid.error;
    expect(valid.value.authorityId).toMatch(/^[A-Za-z0-9._-]+$/u);
    expect(valid.value.authorityEvidenceId).toMatch(/^[A-Za-z0-9._-]+$/u);

    const crossSubject = await authority.verifyTrustedApproval({
      approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
      artifactDigest: fixture.releaseCandidate.candidateDigest,
    });
    expect(crossSubject).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
  });

  it("跨制品摘要或篡改 receiptDigest 的回执均被拒绝", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const authority = createExecutorCompatibilityTrustedApprovalAuthority(
      [
        {
          approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
          artifactDigest: fixture.releaseCandidate.candidateDigest,
          decisionRequest: fixture.decisionRequest,
          approvalRecord: fixture.approvalRecord,
        },
      ],
      fixture.digest,
    );
    const valid = await authority.verifyTrustedApproval({
      approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
      artifactDigest: fixture.releaseCandidate.candidateDigest,
    });
    if (valid.status === ResultStatus.Failure) throw valid.error;

    const expected = {
      decisionRequest: fixture.decisionRequest,
      approvalRecord: fixture.approvalRecord,
    };
    const crossSubject = validateExecutorCompatibilityReleaseApprovalVerificationReceipt(
      {
        authorityInput: {
          approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
          artifactDigest: fixture.releaseCandidate.candidateDigest,
        },
        receipt: valid.value,
        expected,
      },
      fixture.digest,
    );
    expect(crossSubject).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });

    const crossDigest = validateExecutorCompatibilityReleaseApprovalVerificationReceipt(
      {
        authorityInput: {
          approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
          artifactDigest: fixture.releaseSubject.packageDigest,
        },
        receipt: valid.value,
        expected,
      },
      fixture.digest,
    );
    expect(crossDigest).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });

    const tampered = validateExecutorCompatibilityReleaseApprovalVerificationReceipt(
      {
        authorityInput: {
          approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
          artifactDigest: fixture.releaseCandidate.candidateDigest,
        },
        receipt: { ...valid.value, receiptDigest: fixture.releaseSubject.packageDigest },
        expected,
      },
      fixture.digest,
    );
    expect(tampered).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });

    const { receiptDigest, ...receiptInput } = valid.value;
    void receiptDigest;
    const invalidAuthorityId = createExecutorCompatibilityReleaseApprovalVerificationReceipt(
      { ...receiptInput, authorityId: "invalid authority id" },
      fixture.digest,
    );
    expect(invalidAuthorityId).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
  });
});
