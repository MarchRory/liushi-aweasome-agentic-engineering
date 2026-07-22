import type { HarnessError, Result } from "#common/index.js";

import type {
  ExecutorCompatibilityAttestationCryptographicVerificationResult,
  VerifyExecutorCompatibilityAttestationInput,
} from "./contracts/index.js";

/** 使用调用方显式 Trusted Root 的纯离线 Sigstore 验证边界。 */
export interface ExecutorCompatibilityAttestationVerifierPort {
  /** 不读取 TUF、网络或用户缓存，关闭式验证 DSSE 与发布者身份。 */
  verify(
    input: VerifyExecutorCompatibilityAttestationInput,
  ): Promise<Result<ExecutorCompatibilityAttestationCryptographicVerificationResult, HarnessError>>;
}
