import type { ExecutorCompatibilityEvidenceProjection } from "#application/ports/index.js";
import type {
  ExecutorCompatibilityMatrix,
  ExecutorCompatibilityPolicy,
} from "#domain/executorCompatibility/index.js";

/** 已从持久化来源完整重建并重新证明的 Compatibility 记录。 */
export interface VerifiedExecutorCompatibilityRecord {
  /** 由当前受信 Policy 与复验 Evidence 重新编译的 Matrix。 */
  readonly matrix: ExecutorCompatibilityMatrix;
  /** 当前源码固定的完整受信 Policy。 */
  readonly policy: ExecutorCompatibilityPolicy;
  /** 已通过来源专属复验和跨来源绑定校验的 Projection。 */
  readonly projections: readonly ExecutorCompatibilityEvidenceProjection[];
}
