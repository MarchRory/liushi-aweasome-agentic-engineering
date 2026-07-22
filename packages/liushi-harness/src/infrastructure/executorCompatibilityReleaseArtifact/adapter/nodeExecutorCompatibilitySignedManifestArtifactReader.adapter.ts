import {
  validateExecutorCompatibilitySignedReleaseManifestArtifact,
  type ExecutorCompatibilitySignedReleaseManifestArtifact,
} from "#application/executorCompatibilityReleaseManifestAttestation/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type {
  ExecutorCompatibilitySignedManifestArtifactReaderPort,
  ReadExecutorCompatibilityReleaseArtifactInput,
} from "#application/ports/executorCompatibilityReleaseArtifactReader/index.js";
import type { HarnessError, Result } from "#common/index.js";

import { readValidatedReleaseArtifact } from "../service/index.js";

/** P4b3 Signed Manifest Artifact 的严格 canonical Reader。 */
export class NodeExecutorCompatibilitySignedManifestArtifactReaderAdapter implements ExecutorCompatibilitySignedManifestArtifactReaderPort {
  public constructor(private readonly digest: ContentDigestPort) {}

  /** 严格读取 canonical JSON，并重算 P4b3 Artifact 的全部摘要。 */
  public read(
    input: ReadExecutorCompatibilityReleaseArtifactInput,
  ): Promise<Result<ExecutorCompatibilitySignedReleaseManifestArtifact, HarnessError>> {
    return readValidatedReleaseArtifact(
      input,
      this.digest,
      validateExecutorCompatibilitySignedReleaseManifestArtifact,
    );
  }
}
