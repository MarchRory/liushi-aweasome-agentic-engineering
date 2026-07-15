import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type {
  ExecutorCapabilityEvidence,
  ExecutorEvidenceLocatorKind,
  ExecutorEvidenceOutcome,
  ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";

import type { CodexCompatibilityObservationKind } from "../enums/index.js";

/** 受验 Codex 原始 Artifact 的不可逆摘要绑定。 */
export interface CodexCompatibilitySourceDigests {
  /** Host Smoke Prepare Manifest 的 RFC 8785 摘要。 */
  readonly prepareManifest: ContentDigest;
  /** Human Activation Plan 的 RFC 8785 摘要。 */
  readonly activationPlan: ContentDigest;
  /** Prepare Manifest 中静态 Probe 投影的 RFC 8785 摘要。 */
  readonly staticProbe: ContentDigest;
  /** Host Result v2 原始报告的 RFC 8785 摘要。 */
  readonly hostResult: ContentDigest;
  /** 绑定版本、配置、项目和 Human 激活动作的摘要。 */
  readonly activation: ContentDigest;
}

/** 脱敏兼容性 Artifact 中的一项观察。 */
export interface CodexCompatibilityObservation {
  /** 观察来源类型。 */
  readonly kind: CodexCompatibilityObservationKind;
  /** 观察产生时间。 */
  readonly observedAt: string;
  /** 受验来源允许形成的 Evidence Outcome。 */
  readonly outcome: ExecutorEvidenceOutcome;
  /** 实际参与结论的稳定检查项。 */
  readonly checkIds: readonly string[];
}

/** 可以持久化和发布的脱敏 Codex 兼容性 Artifact。 */
export interface CodexCompatibilityEvidenceArtifact {
  /** 脱敏 Artifact 契约版本。 */
  readonly schemaVersion: string;
  /** 被评估的 Executor Compatibility Profile。 */
  readonly profileId: string;
  /** 从受验 Host Packet 派生的精确 Scope。 */
  readonly scope: ExecutorHostScope;
  /** 原始输入的不可逆摘要绑定。 */
  readonly sourceDigests: CodexCompatibilitySourceDigests;
  /** 静态与动态观察的脱敏结论。 */
  readonly observations: readonly CodexCompatibilityObservation[];
}

/** Codex 兼容性证据投影的未信任边界输入。 */
export interface ProjectCodexCompatibilityEvidenceInput {
  /** Host Smoke Prepare Manifest 原始 JSON 值。 */
  readonly prepareManifest: unknown;
  /** Host Smoke Activation Plan 原始 JSON 值。 */
  readonly activationPlan: unknown;
  /** verify-result v2 原始 JSON 值。 */
  readonly hostResult: unknown;
  /** 未来持久化脱敏 Artifact 的 Locator 存储边界。 */
  readonly artifactLocatorKind: ExecutorEvidenceLocatorKind;
}

/** Codex 兼容性证据投影的确定性输出。 */
export interface CodexCompatibilityEvidenceProjection {
  /** 不包含绝对路径和原始宿主标识的 Artifact。 */
  readonly artifact: CodexCompatibilityEvidenceArtifact;
  /** 脱敏 Artifact 的 RFC 8785 摘要。 */
  readonly artifactDigest: ContentDigest;
  /** 可以交给 Domain Compiler 的规范 Evidence。 */
  readonly evidence: readonly ExecutorCapabilityEvidence[];
}

/** Codex 兼容性证据投影器端口。 */
export interface CodexCompatibilityEvidenceProjector {
  /** 校验受验来源并输出脱敏 Artifact 与规范 Evidence。 */
  project(
    input: ProjectCodexCompatibilityEvidenceInput,
  ): Result<CodexCompatibilityEvidenceProjection, HarnessError>;
}
