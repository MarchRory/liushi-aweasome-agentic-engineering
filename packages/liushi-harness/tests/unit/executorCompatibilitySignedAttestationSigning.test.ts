import { describe, expect, it, vi } from "vitest";

import {
  SignExecutorCompatibilityReleaseAttestationUseCase,
  type ExecutorCompatibilityAttestationSignerPort,
} from "../../src/application/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
} from "../../src/common/index.js";
import { IN_TOTO_ATTESTATION_PAYLOAD_TYPE } from "../../src/domain/executorCompatibilityAttestation/index.js";
import {
  createExecutorCompatibilityAttestationFixture,
  createExecutorCompatibilitySigstoreBundleStub,
  createStrictExecutorCompatibilityAttestationDraft,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Signed Attestation Signing", () => {
  it("仅在完整重建 G6 Draft 后调用 Signer 并生成内容寻址 Artifact", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const sign = vi.fn<ExecutorCompatibilityAttestationSignerPort["sign"]>(() =>
      Promise.resolve(success({ sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub() })),
    );
    const useCase = new SignExecutorCompatibilityReleaseAttestationUseCase(
      { sign },
      fixture.digest,
    );

    const result = await useCase.execute({
      draft: createStrictExecutorCompatibilityAttestationDraft(fixture),
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) throw result.error;
    expect(sign).toHaveBeenCalledOnce();
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
    const useCase = new SignExecutorCompatibilityReleaseAttestationUseCase(
      { sign },
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
      fixture.digest,
    );

    const result = await useCase.execute({
      draft: createStrictExecutorCompatibilityAttestationDraft(fixture),
    });

    expect(result).toEqual(failure(expectedError));
  });
});
