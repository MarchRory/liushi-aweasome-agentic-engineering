import type { HarnessError, Result } from "#common/index.js";
import type { ExecutorEvidenceLocatorKind } from "#domain/executorCompatibility/index.js";

import type { ExecutorCompatibilityEvidenceProjection } from "../executorCompatibilityEvidenceProjectionVerifier/index.js";

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

/** 将未信任 Codex Host JSON 投影为受信兼容性证据的 Application Port。 */
export interface CodexCompatibilityEvidenceProjectorPort {
  /** 关闭式校验来源并返回脱敏 Artifact 与规范 Evidence。 */
  project(
    input: ProjectCodexCompatibilityEvidenceInput,
  ): Result<ExecutorCompatibilityEvidenceProjection, HarnessError>;
}
