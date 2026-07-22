import {
  SignExecutorCompatibilityReleaseAttestationUseCase,
  VerifyExecutorCompatibilityReleaseAttestationUseCase,
} from "#application/index.js";
import type {
  ContentDigestPort,
  ExecutorCompatibilityAttestationSignerPort,
  ExecutorCompatibilityAttestationVerifierPort,
} from "#application/ports/index.js";
import {
  SigstoreExecutorCompatibilityAttestationSignerAdapter,
  SigstoreExecutorCompatibilityAttestationVerifierAdapter,
} from "#infrastructure/index.js";

/** Composition Root 传入的可替换 Release Attestation Port。 */
export interface ExecutorCompatibilityAttestationApplicationFactoryOptions {
  /** 可选签名实现；默认使用官方 sigstore-js 联网签名。 */
  readonly executorCompatibilityAttestationSigner?: ExecutorCompatibilityAttestationSignerPort;
  /** 可选验证实现；默认使用显式 Trusted Root 的纯离线 Verifier。 */
  readonly executorCompatibilityAttestationVerifier?: ExecutorCompatibilityAttestationVerifierPort;
}

/** 装配 Executor Compatibility Release Attestation 的签名与离线验证入口。 */
export function createExecutorCompatibilityAttestationApplication(
  options: ExecutorCompatibilityAttestationApplicationFactoryOptions,
  digest: ContentDigestPort,
): {
  /** 对已获 G6 Approval 的 Draft 执行真实 Sigstore 签名。 */
  readonly signExecutorCompatibilityReleaseAttestation: SignExecutorCompatibilityReleaseAttestationUseCase;
  /** 使用调用方显式 Trusted Root 离线验证签名 Artifact。 */
  readonly verifyExecutorCompatibilityReleaseAttestation: VerifyExecutorCompatibilityReleaseAttestationUseCase;
} {
  return {
    signExecutorCompatibilityReleaseAttestation:
      new SignExecutorCompatibilityReleaseAttestationUseCase(
        options.executorCompatibilityAttestationSigner ??
          new SigstoreExecutorCompatibilityAttestationSignerAdapter(),
        digest,
      ),
    verifyExecutorCompatibilityReleaseAttestation:
      new VerifyExecutorCompatibilityReleaseAttestationUseCase(
        options.executorCompatibilityAttestationVerifier ??
          new SigstoreExecutorCompatibilityAttestationVerifierAdapter(),
        digest,
      ),
  };
}
