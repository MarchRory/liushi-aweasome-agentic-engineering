import type {
  ExecutorCompatibilityAttestationSigningResult,
  SignExecutorCompatibilityAttestationInput,
} from "./contracts/index.js";
import type { HarnessError, Result } from "#common/index.js";

/** 已获 G6 批准的 Executor Compatibility Attestation 签名边界。 */
export interface ExecutorCompatibilityAttestationSignerPort {
  /** 生成包含证书和透明日志证明的 Sigstore DSSE Bundle。 */
  sign(
    input: SignExecutorCompatibilityAttestationInput,
  ): Promise<Result<ExecutorCompatibilityAttestationSigningResult, HarnessError>>;
}
