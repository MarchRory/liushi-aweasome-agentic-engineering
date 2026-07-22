import type { ExecutorCompatibilityReleaseAttestationDraft } from "#domain/executorCompatibilityAttestation/index.js";
import type { ExecutorCompatibilityReleaseManifestAttestationDraft } from "#domain/executorCompatibilityReleaseManifestAttestation/index.js";
import type { HarnessError, Result } from "#common/index.js";

/** 严格 Draft Reader 的输入。 */
export interface ReadExecutorCompatibilityReleaseDraftInput {
  /** 只能读取的绝对 Draft 文件路径。 */
  readonly draftFilePath: string;
}

/** 内部 Release Draft Reader Port。 */
export interface ExecutorCompatibilityReleaseDraftReaderPort {
  /** 读取并重建 Release Attestation Draft。 */
  readAttestationDraft(
    input: ReadExecutorCompatibilityReleaseDraftInput,
  ): Promise<Result<ExecutorCompatibilityReleaseAttestationDraft, HarnessError>>;
  /** 读取并重建 Release Manifest Attestation Draft。 */
  readManifestDraft(
    input: ReadExecutorCompatibilityReleaseDraftInput,
  ): Promise<Result<ExecutorCompatibilityReleaseManifestAttestationDraft, HarnessError>>;
}
