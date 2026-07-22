import { describe, expect, it, vi } from "vitest";

import { SignExecutorCompatibilityReleaseManifestUseCase } from "../../src/application/useCases/signExecutorCompatibilityReleaseManifest/index.js";
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
  type ContentDigest,
} from "../../src/common/index.js";
import {
  ExecutorCompatibilityReleaseApprovalSubject,
  IN_TOTO_ATTESTATION_PAYLOAD_TYPE,
} from "../../src/domain/executorCompatibilityAttestation/index.js";
import { createExecutorCompatibilityReleaseManifestAttestationDraft } from "../../src/domain/executorCompatibilityReleaseManifestAttestation/index.js";
import {
  createExecutorCompatibilityReleaseManifestAttestationFixture,
  createExecutorCompatibilitySigstoreBundleStub,
  createExecutorCompatibilityTrustedApprovalAuthority,
  createExecutorCompatibilityUnavailableReleaseApprovalAuthority,
  withManifestApprovalRecordDigest,
  withManifestDecisionRequestDigest,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Signed Release Manifest Signing", () => {
  it("仅在完整 Draft 重建成功后调用一次 Signer 并创建 Artifact", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const sign = vi.fn<ExecutorCompatibilityAttestationSignerPort["sign"]>(() =>
      Promise.resolve(success({ sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub() })),
    );
    const authorityQueries: ExecutorCompatibilityReleaseApprovalAuthorityInput[] = [];
    const authority = createExecutorCompatibilityTrustedApprovalAuthority(
      [
        {
          approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
          artifactDigest: fixture.manifest.manifestDigest,
          decisionRequest: fixture.manifestDecisionRequest,
          approvalRecord: fixture.manifestApprovalRecord,
        },
      ],
      fixture.digest,
      authorityQueries,
    );
    const useCase = new SignExecutorCompatibilityReleaseManifestUseCase(
      { sign },
      authority,
      fixture.digest,
    );

    const result = await useCase.execute({ draft: fixture.manifestAttestationDraft });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) throw result.error;
    expect(sign).toHaveBeenCalledOnce();
    expect(authorityQueries).toEqual([
      {
        approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
        artifactDigest: fixture.manifest.manifestDigest,
      },
    ]);
    expect(sign).toHaveBeenCalledWith({
      payloadType: IN_TOTO_ATTESTATION_PAYLOAD_TYPE,
      statement: fixture.manifestAttestationDraft.statement,
    });
    expect(result.value.statementDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.value.sigstoreBundleDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.value.artifactDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("Draft 存在额外字段或 Statement 漂移时不调用 Signer", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const sign = vi.fn<ExecutorCompatibilityAttestationSignerPort["sign"]>(() =>
      Promise.resolve(success({ sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub() })),
    );
    const authority = createExecutorCompatibilityTrustedApprovalAuthority(
      [
        {
          approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
          artifactDigest: fixture.manifest.manifestDigest,
          decisionRequest: fixture.manifestDecisionRequest,
          approvalRecord: fixture.manifestApprovalRecord,
        },
      ],
      fixture.digest,
    );
    const useCase = new SignExecutorCompatibilityReleaseManifestUseCase(
      { sign },
      authority,
      fixture.digest,
    );
    const draft = fixture.manifestAttestationDraft;
    const statement = {
      ...draft.statement,
      subject: [
        {
          ...draft.statement.subject[0],
          digest: { sha256: "0".repeat(64) },
        },
      ],
    };

    for (const [candidate, expectedCode] of [
      [{ ...draft, unexpected: true }, HarnessErrorCode.InvalidInput],
      [{ ...draft, statement }, HarnessErrorCode.PreconditionNotMet],
    ]) {
      const result = await useCase.execute({ draft: candidate as never });

      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: expectedCode },
      });
    }
    expect(sign).not.toHaveBeenCalled();
  });

  it("原样返回 Signer 的明确错误", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const expectedError = new HarnessError(
      HarnessErrorCode.ExecutorCompatibilityAttestationSigningFailed,
      "测试签名失败。",
    );
    const useCase = new SignExecutorCompatibilityReleaseManifestUseCase(
      { sign: () => Promise.resolve(failure(expectedError)) },
      createExecutorCompatibilityTrustedApprovalAuthority(
        [
          {
            approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
            artifactDigest: fixture.manifest.manifestDigest,
            decisionRequest: fixture.manifestDecisionRequest,
            approvalRecord: fixture.manifestApprovalRecord,
          },
        ],
        fixture.digest,
      ),
      fixture.digest,
    );

    const result = await useCase.execute({ draft: fixture.manifestAttestationDraft });

    expect(result).toEqual(failure(expectedError));
  });

  it("Authority 不可用时拒绝签名且不调用 Signer", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const sign = vi.fn<ExecutorCompatibilityAttestationSignerPort["sign"]>();
    const result = await new SignExecutorCompatibilityReleaseManifestUseCase(
      { sign },
      createExecutorCompatibilityUnavailableReleaseApprovalAuthority(),
      fixture.digest,
    ).execute({ draft: fixture.manifestAttestationDraft });
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
        _fixture: Awaited<
          ReturnType<typeof createExecutorCompatibilityReleaseManifestAttestationFixture>
        >,
        alternateDigest: ContentDigest,
      ) => ({ ...receipt, receiptDigest: alternateDigest }),
    ],
    [
      "approvalSubject",
      (receipt: ExecutorCompatibilityReleaseApprovalVerificationReceipt) => ({
        ...receipt,
        approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
      }),
    ],
    [
      "artifactDigest",
      (
        receipt: ExecutorCompatibilityReleaseApprovalVerificationReceipt,
        _fixture: Awaited<
          ReturnType<typeof createExecutorCompatibilityReleaseManifestAttestationFixture>
        >,
        alternateDigest: ContentDigest,
      ) => ({ ...receipt, artifactDigest: alternateDigest }),
    ],
  ] as const)("Authority 回执 %s 被篡改时拒绝签名", async (_label, mutate) => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const alternateDigestResult = fixture.digest.calculate("tampered-manifest-artifact");
    if (alternateDigestResult.status === ResultStatus.Failure) throw alternateDigestResult.error;
    const validAuthority = createExecutorCompatibilityTrustedApprovalAuthority(
      [
        {
          approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
          artifactDigest: fixture.manifest.manifestDigest,
          decisionRequest: fixture.manifestDecisionRequest,
          approvalRecord: fixture.manifestApprovalRecord,
        },
      ],
      fixture.digest,
    );
    const valid = await validAuthority.verifyTrustedApproval({
      approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
      artifactDigest: fixture.manifest.manifestDigest,
    });
    if (valid.status === ResultStatus.Failure) throw valid.error;
    const sign = vi.fn<ExecutorCompatibilityAttestationSignerPort["sign"]>();
    const authority = {
      verifyTrustedApproval: vi.fn(() =>
        Promise.resolve(success(mutate(valid.value, fixture, alternateDigestResult.value))),
      ),
    };
    const result = await new SignExecutorCompatibilityReleaseManifestUseCase(
      { sign },
      authority,
      fixture.digest,
    ).execute({ draft: fixture.manifestAttestationDraft });
    expect(result).toMatchObject({ status: ResultStatus.Failure });
    expect(sign).not.toHaveBeenCalled();
  });

  it("调用方自洽但未获 Authority 认可的审批记录不能触发签名", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const decisionRequest = withManifestDecisionRequestDigest(
      {
        ...fixture.manifestDecisionRequest,
        createdBy: { ...fixture.manifestDecisionRequest.createdBy, actorId: "other-planner" },
      },
      fixture,
    );
    const approvalRecord = withManifestApprovalRecordDigest(
      { ...fixture.manifestApprovalRecord, decisionRequestDigest: decisionRequest.digest },
      fixture,
    );
    const draft = createExecutorCompatibilityReleaseManifestAttestationDraft(
      {
        manifest: fixture.manifest,
        publisherIdentityPolicy: fixture.publisherIdentityPolicy,
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
          approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
          artifactDigest: fixture.manifest.manifestDigest,
          decisionRequest: fixture.manifestDecisionRequest,
          approvalRecord: fixture.manifestApprovalRecord,
        },
      ],
      fixture.digest,
    );
    const result = await new SignExecutorCompatibilityReleaseManifestUseCase(
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
