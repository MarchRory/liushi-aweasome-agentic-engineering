import { describe, expect, it, vi } from "vitest";

import { SignExecutorCompatibilityReleaseAttestationUseCase } from "../../src/application/useCases/signExecutorCompatibilityReleaseAttestation/index.js";
import type { ExecutorCompatibilityAttestationSignerPort } from "../../src/application/ports/executorCompatibilityAttestation/executorCompatibilityAttestationSigner.port.js";
import type {
  ExecutorCompatibilityReleaseApprovalAuthorityInput,
  ExecutorCompatibilityReleaseApprovalVerificationReceipt,
} from "../../src/application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
} from "../../src/common/index.js";
import {
  ExecutorCompatibilityReleaseApprovalSubject,
  createExecutorCompatibilityReleaseAttestationDraft,
  IN_TOTO_ATTESTATION_PAYLOAD_TYPE,
} from "../../src/domain/executorCompatibilityAttestation/index.js";
import {
  createExecutorCompatibilityAttestationFixture,
  createExecutorCompatibilitySigstoreBundleStub,
  createStrictExecutorCompatibilityAttestationDraft,
  createExecutorCompatibilityTrustedApprovalAuthority,
  createExecutorCompatibilityUnavailableReleaseApprovalAuthority,
  withApprovalRecordDigest,
  withDecisionRequestDigest,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Signed Attestation Signing", () => {
  it("仅在完整重建 G6 Draft 后调用 Signer 并生成内容寻址 Artifact", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const sign = vi.fn<ExecutorCompatibilityAttestationSignerPort["sign"]>(() =>
      Promise.resolve(success({ sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub() })),
    );
    const authorityQueries: ExecutorCompatibilityReleaseApprovalAuthorityInput[] = [];
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
      authorityQueries,
    );
    const useCase = new SignExecutorCompatibilityReleaseAttestationUseCase(
      { sign },
      authority,
      fixture.digest,
    );

    const result = await useCase.execute({
      draft: createStrictExecutorCompatibilityAttestationDraft(fixture),
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) throw result.error;
    expect(sign).toHaveBeenCalledOnce();
    expect(authorityQueries).toEqual([
      {
        approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
        artifactDigest: fixture.releaseCandidate.candidateDigest,
      },
    ]);
    expect(sign).toHaveBeenCalledWith({
      payloadType: IN_TOTO_ATTESTATION_PAYLOAD_TYPE,
      statement: fixture.statement,
    });
    expect(result.value.statementDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.value.sigstoreBundleDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.value.artifactDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("Draft 重复绑定字段漂移时在 Signer 边界前关闭失败", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const sign = vi.fn<ExecutorCompatibilityAttestationSignerPort["sign"]>(() =>
      Promise.resolve(success({ sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub() })),
    );
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
    const useCase = new SignExecutorCompatibilityReleaseAttestationUseCase(
      { sign },
      authority,
      fixture.digest,
    );
    const draft = createStrictExecutorCompatibilityAttestationDraft(fixture);

    const result = await useCase.execute({
      draft: {
        ...draft,
        statement: {
          ...draft.statement,
          predicate: {
            ...draft.statement.predicate,
            releaseSubject: {
              ...draft.statement.predicate.releaseSubject,
              packageVersion: "9.9.9",
            },
          },
        },
      },
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
    expect(sign).not.toHaveBeenCalled();
  });

  it("不吞掉 Signer Port 的明确失败", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const expectedError = new HarnessError(
      HarnessErrorCode.ExecutorCompatibilityAttestationSigningFailed,
      "测试签名失败。",
    );
    const useCase = new SignExecutorCompatibilityReleaseAttestationUseCase(
      { sign: () => Promise.resolve(failure(expectedError)) },
      createExecutorCompatibilityTrustedApprovalAuthority(
        [
          {
            approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
            artifactDigest: fixture.releaseCandidate.candidateDigest,
            decisionRequest: fixture.decisionRequest,
            approvalRecord: fixture.approvalRecord,
          },
        ],
        fixture.digest,
      ),
      fixture.digest,
    );

    const result = await useCase.execute({
      draft: createStrictExecutorCompatibilityAttestationDraft(fixture),
    });

    expect(result).toEqual(failure(expectedError));
  });

  it("Authority 不可用时拒绝签名且不调用 Signer", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const sign = vi.fn<ExecutorCompatibilityAttestationSignerPort["sign"]>();
    const result = await new SignExecutorCompatibilityReleaseAttestationUseCase(
      { sign },
      createExecutorCompatibilityUnavailableReleaseApprovalAuthority(),
      fixture.digest,
    ).execute({ draft: createStrictExecutorCompatibilityAttestationDraft(fixture) });
    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    expect(sign).not.toHaveBeenCalled();
  });

  it.each([
    [
      "receiptDigest",
      (
        receipt: ExecutorCompatibilityReleaseApprovalVerificationReceipt,
        fixture: Awaited<ReturnType<typeof createExecutorCompatibilityAttestationFixture>>,
      ) => ({ ...receipt, receiptDigest: fixture.releaseSubject.packageDigest }),
    ],
    [
      "approvalSubject",
      (receipt: ExecutorCompatibilityReleaseApprovalVerificationReceipt) => ({
        ...receipt,
        approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
      }),
    ],
    [
      "artifactDigest",
      (
        receipt: ExecutorCompatibilityReleaseApprovalVerificationReceipt,
        fixture: Awaited<ReturnType<typeof createExecutorCompatibilityAttestationFixture>>,
      ) => ({ ...receipt, artifactDigest: fixture.releaseSubject.packageDigest }),
    ],
  ] as const)("Authority 回执 %s 被篡改时拒绝签名", async (_label, mutate) => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const validAuthority = createExecutorCompatibilityTrustedApprovalAuthority(
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
    const valid = await validAuthority.verifyTrustedApproval({
      approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
      artifactDigest: fixture.releaseCandidate.candidateDigest,
    });
    if (valid.status === ResultStatus.Failure) throw valid.error;
    const sign = vi.fn<ExecutorCompatibilityAttestationSignerPort["sign"]>();
    const authority = {
      verifyTrustedApproval: vi.fn(() => Promise.resolve(success(mutate(valid.value, fixture)))),
    };
    const result = await new SignExecutorCompatibilityReleaseAttestationUseCase(
      { sign },
      authority,
      fixture.digest,
    ).execute({ draft: createStrictExecutorCompatibilityAttestationDraft(fixture) });
    expect(result).toMatchObject({ status: ResultStatus.Failure });
    expect(sign).not.toHaveBeenCalled();
  });

  it("调用方自洽但未获 Authority 认可的审批记录不能触发签名", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const decisionRequest = withDecisionRequestDigest(
      {
        ...fixture.decisionRequest,
        createdBy: { ...fixture.decisionRequest.createdBy, actorId: "other-planner" },
      },
      fixture,
    );
    const approvalRecord = withApprovalRecordDigest(
      { ...fixture.approvalRecord, decisionRequestDigest: decisionRequest.digest },
      fixture,
    );
    const draft = createExecutorCompatibilityReleaseAttestationDraft(
      {
        bundle: fixture.bundle,
        publisherIdentityPolicy: fixture.publisherIdentityPolicy,
        releaseCandidate: fixture.releaseCandidate,
        decisionRequest,
        approvalRecord,
      },
      fixture.digest,
    );
    if (draft.status === ResultStatus.Failure) throw draft.error;
    const sign = vi.fn<ExecutorCompatibilityAttestationSignerPort["sign"]>();
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
    const result = await new SignExecutorCompatibilityReleaseAttestationUseCase(
      { sign },
      authority,
      fixture.digest,
    ).execute({ draft: draft.value });
    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    expect(sign).not.toHaveBeenCalled();
  });
});
