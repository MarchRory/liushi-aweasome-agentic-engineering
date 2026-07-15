import type { ContentDigest } from "#common/index.js";
import type {
  ExecutorCompatibilityMatrix,
  ExecutorCompatibilityPolicy,
} from "#domain/executorCompatibility/index.js";

import type { ExecutorCompatibilityWriteDisposition } from "./executorCompatibilityStore.enums.js";

/** Executor Compatibility Evidence Projection 的持久化结果。 */
export interface ExecutorCompatibilityEvidenceWriteResult {
  /** 本次不可变写入的处置。 */
  readonly disposition: ExecutorCompatibilityWriteDisposition;
  /** 已持久化脱敏来源 Artifact 的摘要。 */
  readonly artifactDigest: ContentDigest;
  /** 已持久化规范 Evidence 的稳定摘要集合。 */
  readonly evidenceDigests: readonly ContentDigest[];
}

/** Executor Compatibility Matrix 与 Policy 的持久化结果。 */
export interface ExecutorCompatibilityMatrixWriteResult {
  /** 本次不可变写入的处置。 */
  readonly disposition: ExecutorCompatibilityWriteDisposition;
  /** 已持久化 Matrix 的规范摘要。 */
  readonly matrixDigest: ContentDigest;
}

/** 可跨进程恢复的 Executor Compatibility Matrix 与 Policy 记录。 */
export interface ExecutorCompatibilityMatrixRecord {
  /** 已编译的不可变 Matrix。 */
  readonly matrix: ExecutorCompatibilityMatrix;
  /** 编译该 Matrix 时使用的完整 Policy。 */
  readonly policy: ExecutorCompatibilityPolicy;
}
