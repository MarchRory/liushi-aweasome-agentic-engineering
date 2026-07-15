import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type {
  ExecutorCapabilityEvidence,
  ExecutorEvidenceLocatorKind,
} from "#domain/executorCompatibility/index.js";

/** Codex 兼容性证据投影的未信任输入。 */
export interface ProjectCodexCompatibilityEvidenceInput {
  /** Host Smoke Prepare Manifest 原始 JSON。 */
  readonly prepareManifest: unknown;
  /** Human Activation Plan 原始 JSON。 */
  readonly activationPlan: unknown;
  /** Host Result 原始 JSON。 */
  readonly hostResult: unknown;
  /** 脱敏 Artifact 的目标存储边界。 */
  readonly artifactLocatorKind: ExecutorEvidenceLocatorKind;
}

/** 可持久化的受信 Codex 兼容性证据投影。 */
export interface ExecutorCompatibilityEvidenceProjection {
  /** 已由投影器脱敏的来源 Artifact。 */
  readonly artifact: unknown;
  /** 脱敏 Artifact 的稳定摘要。 */
  readonly artifactDigest: ContentDigest;
  /** 已归一化并完成摘要绑定的完整 Evidence。 */
  readonly evidence: readonly ExecutorCapabilityEvidence[];
}

/** 将未信任 Codex Host JSON 投影为受信兼容性证据的 Application Port。 */
export interface CodexCompatibilityEvidenceProjectorPort {
  /** 关闭式校验来源并返回脱敏 Artifact 与规范 Evidence。 */
  project(
    input: ProjectCodexCompatibilityEvidenceInput,
  ): Result<ExecutorCompatibilityEvidenceProjection, HarnessError>;
  /** 从持久化脱敏 Artifact 重新投影并比对完整规范 Evidence。 */
  verifyPersistedProjection(
    projection: ExecutorCompatibilityEvidenceProjection,
  ): Result<ExecutorCompatibilityEvidenceProjection, HarnessError>;
}
