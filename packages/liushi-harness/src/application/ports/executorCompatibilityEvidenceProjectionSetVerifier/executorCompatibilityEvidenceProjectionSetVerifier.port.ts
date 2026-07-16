import type { HarnessError, Result } from "#common/index.js";

import type { ExecutorCompatibilityEvidenceProjection } from "../executorCompatibilityEvidenceProjectionVerifier/index.js";

/** 对完整持久化 Projection 集合执行逐项复验与跨来源关系校验的端口。 */
export interface ExecutorCompatibilityEvidenceProjectionSetVerifierPort {
  /** 一次性复验完整集合，并仅返回已经通过来源绑定校验的 Projection。 */
  verifyPersistedProjectionSet(
    projections: readonly ExecutorCompatibilityEvidenceProjection[],
  ): Result<readonly ExecutorCompatibilityEvidenceProjection[], HarnessError>;
}
