import type { ExecutorCompatibilitySignedReleaseManifestArtifact } from "#application/executorCompatibilityReleaseManifestAttestation/index.js";
import type { ExecutorCompatibilityReleaseArtifactWriteResult } from "#application/ports/executorCompatibilityReleaseArtifactWriter/index.js";
import type { ExecutorCompatibilityReleaseManifestAttestationDraft } from "#domain/executorCompatibilityReleaseManifestAttestation/index.js";
import type { HarnessError, Result } from "#common/index.js";

/** Manifest 发布用例输入。 */
export interface PublishExecutorCompatibilityReleaseManifestUseCaseInput {
  /** 待读取的绝对 Draft 文件路径。 */
  readonly draftFilePath: string;
  /** 待写入的绝对 Artifact 文件路径。 */
  readonly outputFilePath: string;
}

/** Manifest 签名用例的窄结构边界。 */
export interface SignExecutorCompatibilityReleaseManifestBoundary {
  /** 执行 Manifest 签名并返回已验证 Artifact。 */
  execute(input: {
    /** 已由 Reader 重建的完整 Draft。 */
    readonly draft: ExecutorCompatibilityReleaseManifestAttestationDraft;
  }): Promise<Result<ExecutorCompatibilitySignedReleaseManifestArtifact, HarnessError>>;
}

/** Manifest 发布用例结果。 */
export type PublishExecutorCompatibilityReleaseManifestUseCaseResult = Result<
  ExecutorCompatibilityReleaseArtifactWriteResult,
  HarnessError
>;
