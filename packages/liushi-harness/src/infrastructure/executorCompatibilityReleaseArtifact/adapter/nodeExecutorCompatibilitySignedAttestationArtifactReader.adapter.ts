import {
  validateExecutorCompatibilitySignedAttestationArtifact,
  type ExecutorCompatibilitySignedAttestationArtifact,
} from "#application/executorCompatibilityAttestation/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type {
  ExecutorCompatibilitySignedAttestationArtifactReaderPort,
  ReadExecutorCompatibilityReleaseArtifactInput,
} from "#application/ports/executorCompatibilityReleaseArtifactReader/index.js";
import type { HarnessError, Result } from "#common/index.js";

import { readValidatedReleaseArtifact } from "../service/index.js";

/** P3b Signed Attestation Artifact 的严格 canonical Reader。 */
export class NodeExecutorCompatibilitySignedAttestationArtifactReaderAdapter implements ExecutorCompatibilitySignedAttestationArtifactReaderPort {
  public constructor(private readonly digest: ContentDigestPort) {}

  /** 严格读取 canonical JSON，并重算 P3b Artifact 的全部摘要。 */
  public read(
    input: ReadExecutorCompatibilityReleaseArtifactInput,
  ): Promise<Result<ExecutorCompatibilitySignedAttestationArtifact, HarnessError>> {
    return readValidatedReleaseArtifact(
      input,
      this.digest,
      validateExecutorCompatibilitySignedAttestationArtifact,
    );
  }
}
