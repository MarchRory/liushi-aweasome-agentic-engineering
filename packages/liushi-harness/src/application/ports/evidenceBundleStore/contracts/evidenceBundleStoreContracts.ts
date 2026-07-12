import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type { EvidenceBundle } from "#domain/verification/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { EvidenceBundleWriteDisposition } from "../enums/index.js";

/** EvidenceBundle 在 Runtime Store 中的稳定定位信息。 */
export interface EvidenceBundleLocator {
  /** 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** 所属 CodingTask。 */
  readonly codingTaskId: CodingTaskId;
  /** Verification Run 稳定标识。 */
  readonly verificationRunId: string;
}

/** EvidenceBundle 不可变写入结果。 */
export interface EvidenceBundleWriteResult {
  /** 本次写入处置。 */
  readonly disposition: EvidenceBundleWriteDisposition;
  /** Bundle 规范内容摘要。 */
  readonly bundleDigest: ContentDigest;
}

/** EvidenceBundle 强一致持久化 Port。 */
export interface EvidenceBundleStore {
  /** 首次写入或幂等复用一个完整 Bundle。 */
  persist(
    locator: EvidenceBundleLocator,
    bundle: EvidenceBundle,
  ): Promise<Result<EvidenceBundleWriteResult, HarnessError>>;
  /** 读取并重新校验一个不可变 Bundle。 */
  load(locator: EvidenceBundleLocator): Promise<Result<EvidenceBundle, HarnessError>>;
}
