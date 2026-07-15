import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { ExecutorCapabilityEvidence } from "#domain/executorCompatibility/index.js";

/** 可持久化并由执行器专属实现复验的通用兼容性证据投影。 */
export interface ExecutorCompatibilityEvidenceProjection {
  /** 已由投影器脱敏的来源 Artifact。 */
  readonly artifact: unknown;
  /** 脱敏 Artifact 的稳定摘要。 */
  readonly artifactDigest: ContentDigest;
  /** 已归一化并完成摘要绑定的完整 Evidence。 */
  readonly evidence: readonly ExecutorCapabilityEvidence[];
}

/** 对持久化兼容性证据投影执行关闭式复验的执行器无关端口。 */
export interface ExecutorCompatibilityEvidenceProjectionVerifierPort {
  /** 从持久化 Artifact 重新投影并比对完整规范 Evidence。 */
  verifyPersistedProjection(
    projection: ExecutorCompatibilityEvidenceProjection,
  ): Result<ExecutorCompatibilityEvidenceProjection, HarnessError>;
}
