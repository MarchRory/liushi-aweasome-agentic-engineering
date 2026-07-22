import {
  validateExecutorCompatibilitySignedAttestationArtifact,
  type ExecutorCompatibilitySignedAttestationArtifact,
} from "#application/executorCompatibilityAttestation/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  ExecutorCompatibilityStoredReleaseArtifactKind,
  type ExecutorCompatibilityReleaseArtifactWriteResult,
  type ExecutorCompatibilitySignedAttestationArtifactWriterPort,
  type WriteExecutorCompatibilityReleaseArtifactInput,
} from "#application/ports/executorCompatibilityReleaseArtifactWriter/index.js";
import type { HarnessError, Result } from "#common/index.js";
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";

import { writeValidatedReleaseArtifact } from "../service/index.js";

/** P3b Signed Attestation Artifact 的 create-only Writer。 */
export class NodeExecutorCompatibilitySignedAttestationArtifactWriterAdapter implements ExecutorCompatibilitySignedAttestationArtifactWriterPort {
  public constructor(
    private readonly outputRoot: string,
    private readonly digest: ContentDigestPort,
    private readonly parentDirectoryDurability: ParentDirectoryDurability,
  ) {}

  /** 在受信输出根目录下创建或幂等复用 P3b Artifact 文件。 */
  public write(
    input: WriteExecutorCompatibilityReleaseArtifactInput<ExecutorCompatibilitySignedAttestationArtifact>,
  ): Promise<Result<ExecutorCompatibilityReleaseArtifactWriteResult, HarnessError>> {
    return writeValidatedReleaseArtifact(
      this.outputRoot,
      input,
      ExecutorCompatibilityStoredReleaseArtifactKind.SignedAttestation,
      this.digest,
      this.parentDirectoryDurability,
      validateExecutorCompatibilitySignedAttestationArtifact,
    );
  }
}
