import type { ExecutorCompatibilitySignedAttestationArtifact } from "#application/executorCompatibilityAttestation/index.js";
import type { ExecutorCompatibilityReleaseArtifactWriteResult } from "#application/ports/executorCompatibilityReleaseArtifactWriter/index.js";
import type { ExecutorCompatibilityReleaseAttestationDraft } from "#domain/executorCompatibilityAttestation/index.js";
import type { HarnessError, Result } from "#common/index.js";

/** Attestation 发布用例输入。 */
export interface PublishExecutorCompatibilityReleaseAttestationUseCaseInput {
  /** 待读取的绝对 Draft 文件路径。 */
  readonly draftFilePath: string;
  /** 待写入的绝对 Artifact 文件路径。 */
  readonly outputFilePath: string;
}

/** Attestation 签名用例的窄结构边界。 */
export interface SignExecutorCompatibilityReleaseAttestationBoundary {
  /** 执行 Attestation 签名并返回已验证 Artifact。 */
  execute(input: {
    /** 已由 Reader 重建的完整 Draft。 */
    readonly draft: ExecutorCompatibilityReleaseAttestationDraft;
  }): Promise<Result<ExecutorCompatibilitySignedAttestationArtifact, HarnessError>>;
}

/** Attestation 发布用例结果。 */
export type PublishExecutorCompatibilityReleaseAttestationUseCaseResult = Result<
  ExecutorCompatibilityReleaseArtifactWriteResult,
  HarnessError
>;
