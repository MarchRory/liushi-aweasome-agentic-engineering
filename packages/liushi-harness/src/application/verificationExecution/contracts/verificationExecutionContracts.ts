import type {
  EvidenceBundleLocator,
  EvidenceBundleWriteResult,
  RunVerificationInput,
} from "#application/ports/index.js";
import type { EvidenceBundle } from "#domain/verification/index.js";

/** 执行并持久化 Verification 所需的完整输入。 */
export interface RunAndPersistVerificationInput extends RunVerificationInput {
  /** EvidenceBundle 在 CodingTask 下的持久化位置。 */
  readonly locator: EvidenceBundleLocator;
}

/** Verification 执行及证据提交的闭合结果。 */
export interface RunAndPersistVerificationOutput {
  /** 已写入强一致 Store 的完整证据。 */
  readonly bundle: EvidenceBundle;
  /** EvidenceBundle Store 的写入结果。 */
  readonly persistence: EvidenceBundleWriteResult;
}
