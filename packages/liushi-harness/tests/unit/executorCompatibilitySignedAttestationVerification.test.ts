import { describe, expect, it, vi } from "vitest";

import {
  VerifyExecutorCompatibilityReleaseAttestationUseCase,
  type ExecutorCompatibilityAttestationVerifierPort,
} from "../../src/application/index.js";
import { HarnessErrorCode, ResultStatus, success } from "../../src/common/index.js";
import {
  createExecutorCompatibilityAttestationFixture,
  createExecutorCompatibilityTrustedRootStub,
  createSignedAttestationArtifactForFixture,
  createVerifiedSignerIdentityStub,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Signed Attestation Verification", () => {
  it("完整复验 Artifact 后返回窄化且可审计的验证回执", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const artifact = createSignedAttestationArtifactForFixture(fixture);
    const signerIdentity = createVerifiedSignerIdentityStub(fixture);
    const verify = vi.fn<ExecutorCompatibilityAttestationVerifierPort["verify"]>(() =>
      Promise.resolve(success({ signerIdentity })),
    );
    const useCase = new VerifyExecutorCompatibilityReleaseAttestationUseCase(
      { verify },
      fixture.digest,
    );

    const result = await useCase.execute({
      artifact,
      trustedRoot: createExecutorCompatibilityTrustedRootStub(),
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) throw result.error;
    expect(verify).toHaveBeenCalledOnce();
    expect(result.value).toMatchObject({
      artifactDigest: artifact.artifactDigest,
      statementDigest: artifact.statementDigest,
      sigstoreBundleDigest: artifact.sigstoreBundleDigest,
      releaseCandidateDigest: fixture.releaseCandidate.candidateDigest,
      signerIdentity,
    });
    expect(result.value.trustedRootDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("Artifact 摘要漂移时在 Verifier 边界前关闭失败", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const artifact = createSignedAttestationArtifactForFixture(fixture);
    const verify = vi.fn<ExecutorCompatibilityAttestationVerifierPort["verify"]>(() =>
      Promise.resolve(success({ signerIdentity: createVerifiedSignerIdentityStub(fixture) })),
    );
    const useCase = new VerifyExecutorCompatibilityReleaseAttestationUseCase(
      { verify },
      fixture.digest,
    );

    const result = await useCase.execute({
      artifact: {
        ...artifact,
        sigstoreBundle: { ...artifact.sigstoreBundle, marker: "tampered" },
      },
      trustedRoot: createExecutorCompatibilityTrustedRootStub(),
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it("Verifier 返回额外或重复证书扩展时关闭失败", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const signerIdentity = createVerifiedSignerIdentityStub(fixture);
    const useCase = new VerifyExecutorCompatibilityReleaseAttestationUseCase(
      {
        verify: () =>
          Promise.resolve(
            success({
              signerIdentity: {
                ...signerIdentity,
                certificateExtensions: [
                  ...signerIdentity.certificateExtensions,
                  { oid: "1.2.3.4", value: "unexpected" },
                ],
              },
            }),
          ),
      },
      fixture.digest,
    );

    const result = await useCase.execute({
      artifact: createSignedAttestationArtifactForFixture(fixture),
      trustedRoot: createExecutorCompatibilityTrustedRootStub(),
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed,
      },
    });
  });

  it("Trusted Root 非 JSON 对象时在 Verifier 边界前关闭失败", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const verify = vi.fn<ExecutorCompatibilityAttestationVerifierPort["verify"]>(() =>
      Promise.resolve(success({ signerIdentity: createVerifiedSignerIdentityStub(fixture) })),
    );
    const useCase = new VerifyExecutorCompatibilityReleaseAttestationUseCase(
      { verify },
      fixture.digest,
    );

    const result = await useCase.execute({
      artifact: createSignedAttestationArtifactForFixture(fixture),
      trustedRoot: "not-a-trusted-root",
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
    expect(verify).not.toHaveBeenCalled();
  });
});
