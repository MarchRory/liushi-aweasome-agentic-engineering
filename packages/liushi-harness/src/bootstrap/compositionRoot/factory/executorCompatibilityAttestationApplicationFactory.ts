import {
  VerifyExecutorCompatibilityReleaseAttestationUseCase,
  VerifyExecutorCompatibilityReleaseManifestUseCase,
} from "#application/index.js";
import type {
  ContentDigestPort,
  ExecutorCompatibilityAttestationVerifierPort,
} from "#application/ports/index.js";
import { SigstoreExecutorCompatibilityAttestationVerifierAdapter } from "#infrastructure/index.js";

/** Composition Root 传入的可替换 Release Attestation Port。 */
export interface ExecutorCompatibilityAttestationApplicationFactoryOptions {
  /** 可选验证实现；默认使用显式 Trusted Root 的纯离线 Verifier。 */
  readonly executorCompatibilityAttestationVerifier?: ExecutorCompatibilityAttestationVerifierPort;
}

/** 只装配不持有发布凭据的 Executor Compatibility 离线验证入口。 */
export function createExecutorCompatibilityAttestationApplication(
  options: ExecutorCompatibilityAttestationApplicationFactoryOptions,
  digest: ContentDigestPort,
): {
  /** 使用调用方显式 Trusted Root 离线验证签名 Artifact。 */
  readonly verifyExecutorCompatibilityReleaseAttestation: VerifyExecutorCompatibilityReleaseAttestationUseCase;
  /** 使用 Trust Profile 与显式 Trusted Root 离线验证完整 Manifest 发布链。 */
  readonly verifyExecutorCompatibilityReleaseManifest: VerifyExecutorCompatibilityReleaseManifestUseCase;
} {
  const verifier =
    options.executorCompatibilityAttestationVerifier ??
    new SigstoreExecutorCompatibilityAttestationVerifierAdapter();
  return {
    verifyExecutorCompatibilityReleaseAttestation:
      new VerifyExecutorCompatibilityReleaseAttestationUseCase(verifier, digest),
    verifyExecutorCompatibilityReleaseManifest:
      new VerifyExecutorCompatibilityReleaseManifestUseCase(verifier, digest),
  };
}
