import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type {
  ExecutorCapabilityEvidence,
  ExecutorEvidenceLocatorKind,
  ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";

import type {
  ExecutorCompatibilityEvidenceProjection,
  ExecutorCompatibilityEvidenceProjectionVerifierPort,
} from "../executorCompatibilityEvidenceProjectionVerifier/index.js";

/** 由可信 Host Projector 提供的 Codex Contract Evidence 投影输入。 */
export interface ProjectCodexContractEvidenceInput {
  /** 已由 Host Projector 收敛的精确执行器作用域。 */
  readonly scope: ExecutorHostScope;
  /** 可信 Host Artifact 的内容摘要；本端口不执行 Tarball 证明。 */
  readonly hostArtifactDigest: ContentDigest;
  /** 由可信 Host Evidence 提供且可重复使用的确定性观察时间锚点。 */
  readonly observationAnchor: string;
  /** Contract Evidence Artifact 的目标定位边界。 */
  readonly artifactLocatorKind: ExecutorEvidenceLocatorKind;
}

/** 可持久化并可由 Codex 专属校验器重新投影的 Contract Evidence。 */
export interface CodexContractEvidenceProjection extends ExecutorCompatibilityEvidenceProjection {
  /** 严格、脱敏且版本化的 Contract Suite Artifact。 */
  readonly artifact: unknown;
  /** 完整 Artifact 的 RFC 8785 SHA-256 摘要。 */
  readonly artifactDigest: ContentDigest;
  /** 从 Artifact 机械投影出的五条能力证据。 */
  readonly evidence: readonly ExecutorCapabilityEvidence[];
}

/** Codex Contract Evidence 的异步投影与同步持久化复验端口。 */
export interface CodexContractEvidenceProjectorPort extends ExecutorCompatibilityEvidenceProjectionVerifierPort {
  /** 运行固定 Contract Suite 并投影严格 Artifact 与 Evidence。 */
  project(
    input: ProjectCodexContractEvidenceInput,
  ): Promise<Result<CodexContractEvidenceProjection, HarnessError>>;
}
