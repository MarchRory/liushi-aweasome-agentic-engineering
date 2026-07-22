import {
  validateExecutorCompatibilitySignedReleaseManifestArtifact,
  type ExecutorCompatibilitySignedReleaseManifestArtifact,
} from "#application/executorCompatibilityReleaseManifestAttestation/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  ExecutorCompatibilityStoredReleaseArtifactKind,
  type ExecutorCompatibilityReleaseArtifactWriteResult,
  type ExecutorCompatibilitySignedManifestArtifactWriterPort,
  type WriteExecutorCompatibilityReleaseArtifactInput,
} from "#application/ports/executorCompatibilityReleaseArtifactWriter/index.js";
import type { HarnessError, Result } from "#common/index.js";
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";

import { writeValidatedReleaseArtifact } from "../service/index.js";

/** P4b3 Signed Manifest Artifact 的 create-only Writer。 */
export class NodeExecutorCompatibilitySignedManifestArtifactWriterAdapter implements ExecutorCompatibilitySignedManifestArtifactWriterPort {
  public constructor(
    private readonly outputRoot: string,
    private readonly digest: ContentDigestPort,
    private readonly parentDirectoryDurability: ParentDirectoryDurability,
  ) {}

  /** 在受信输出根目录下创建或幂等复用 P4b3 Artifact 文件。 */
  public write(
    input: WriteExecutorCompatibilityReleaseArtifactInput<ExecutorCompatibilitySignedReleaseManifestArtifact>,
  ): Promise<Result<ExecutorCompatibilityReleaseArtifactWriteResult, HarnessError>> {
    return writeValidatedReleaseArtifact(
      this.outputRoot,
      input,
      ExecutorCompatibilityStoredReleaseArtifactKind.SignedManifest,
      this.digest,
      this.parentDirectoryDurability,
      validateExecutorCompatibilitySignedReleaseManifestArtifact,
    );
  }
}
