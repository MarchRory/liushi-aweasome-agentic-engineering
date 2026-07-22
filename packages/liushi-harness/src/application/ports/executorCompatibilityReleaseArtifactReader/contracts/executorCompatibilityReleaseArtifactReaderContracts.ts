import type { ExecutorCompatibilitySignedAttestationArtifact } from "#application/executorCompatibilityAttestation/index.js";
import type { ExecutorCompatibilitySignedReleaseManifestArtifact } from "#application/executorCompatibilityReleaseManifestAttestation/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";

/** Release Artifact Reader 的受信输入。 */
export interface ReadExecutorCompatibilityReleaseArtifactInput {
  /** 要读取的绝对 Artifact 文件路径。 */
  readonly filePath: string;
  /** 调用方已知的精确 Artifact Digest。 */
  readonly expectedArtifactDigest: ContentDigest;
  /** 调用方已知的精确正整数文件字节数。 */
  readonly expectedByteLength: number;
}

/** P3b Signed Attestation Artifact Reader 内部 Port。 */
export interface ExecutorCompatibilitySignedAttestationArtifactReaderPort {
  /** 按精确文件长度与 Artifact 摘要读取并复验已签名发布证明。 */
  read(
    input: ReadExecutorCompatibilityReleaseArtifactInput,
  ): Promise<Result<ExecutorCompatibilitySignedAttestationArtifact, HarnessError>>;
}

/** P4b3 Signed Manifest Artifact Reader 内部 Port。 */
export interface ExecutorCompatibilitySignedManifestArtifactReaderPort {
  /** 按精确文件长度与 Artifact 摘要读取并复验已签名 Manifest。 */
  read(
    input: ReadExecutorCompatibilityReleaseArtifactInput,
  ): Promise<Result<ExecutorCompatibilitySignedReleaseManifestArtifact, HarnessError>>;
}
