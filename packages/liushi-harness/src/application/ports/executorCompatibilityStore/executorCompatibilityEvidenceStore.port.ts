import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { ExecutorCapabilityEvidence } from "#domain/executorCompatibility/index.js";

import type { ExecutorCompatibilityEvidenceProjection } from "../executorCompatibilityEvidenceProjectionVerifier/index.js";
import type { ExecutorCompatibilityEvidenceWriteResult } from "./executorCompatibilityStore.contracts.js";

/** 受信 Executor Compatibility Projection 的不可变持久化 Port。 */
export interface ExecutorCompatibilityEvidenceStore {
  /** 逐文件原子持久化脱敏 Artifact 与完整规范 Evidence。 */
  persist(
    projection: ExecutorCompatibilityEvidenceProjection,
  ): Promise<Result<ExecutorCompatibilityEvidenceWriteResult, HarnessError>>;
  /** 按 Evidence Digest 加载并校验单条规范 Evidence。 */
  load(evidenceDigest: ContentDigest): Promise<Result<ExecutorCapabilityEvidence, HarnessError>>;
  /** 按完整 Evidence Digest 集合恢复确定排序的多来源 Projection。 */
  loadProjections(
    evidenceDigests: readonly ContentDigest[],
  ): Promise<Result<readonly ExecutorCompatibilityEvidenceProjection[], HarnessError>>;
}
