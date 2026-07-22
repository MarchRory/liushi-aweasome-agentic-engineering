import type { ExecutorCompatibilitySignedAttestationArtifact } from "#application/executorCompatibilityAttestation/index.js";
import type { ExecutorCompatibilitySignedReleaseManifestArtifact } from "#application/executorCompatibilityReleaseManifestAttestation/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";

import type {
  ExecutorCompatibilityReleaseArtifactWriteDisposition,
  ExecutorCompatibilityStoredReleaseArtifactKind,
} from "../enums/index.js";

/** Writer 请求只携带 Artifact 与目标路径。 */
export interface WriteExecutorCompatibilityReleaseArtifactInput<TArtifact> {
  /** 已由对应领域校验器完整复验的候选 Artifact。 */
  readonly artifact: TArtifact;
  /** 必须是 constructor 固定 trusted outputRoot 的直接子文件绝对路径。 */
  readonly outputFilePath: string;
}

/** Release Artifact 的统一写入回执。 */
export interface ExecutorCompatibilityReleaseArtifactWriteResult {
  /** 实际存储的 Release Artifact 种类。 */
  readonly kind: ExecutorCompatibilityStoredReleaseArtifactKind;
  /** 首次创建或相同字节幂等复用。 */
  readonly disposition: ExecutorCompatibilityReleaseArtifactWriteDisposition;
  /** 已完整复验的 Artifact Digest。 */
  readonly artifactDigest: ContentDigest;
  /** RFC 8785 JSON 加单一末尾换行的精确字节数。 */
  readonly byteLength: number;
  /** trusted outputRoot 下的绝对直接子文件路径。 */
  readonly outputFilePath: string;
  /** 被写入 Artifact 自身的 Schema 版本。 */
  readonly schemaVersion: string;
}

/** P3b Signed Attestation Artifact Writer 内部 Port。 */
export interface ExecutorCompatibilitySignedAttestationArtifactWriterPort {
  /** 以 create-only 语义写入已完整复验的 Attestation Artifact。 */
  write(
    input: WriteExecutorCompatibilityReleaseArtifactInput<ExecutorCompatibilitySignedAttestationArtifact>,
  ): Promise<Result<ExecutorCompatibilityReleaseArtifactWriteResult, HarnessError>>;
}

/** P4b3 Signed Manifest Artifact Writer 内部 Port。 */
export interface ExecutorCompatibilitySignedManifestArtifactWriterPort {
  /** 以 create-only 语义写入已完整复验的 Manifest Artifact。 */
  write(
    input: WriteExecutorCompatibilityReleaseArtifactInput<ExecutorCompatibilitySignedReleaseManifestArtifact>,
  ): Promise<Result<ExecutorCompatibilityReleaseArtifactWriteResult, HarnessError>>;
}
