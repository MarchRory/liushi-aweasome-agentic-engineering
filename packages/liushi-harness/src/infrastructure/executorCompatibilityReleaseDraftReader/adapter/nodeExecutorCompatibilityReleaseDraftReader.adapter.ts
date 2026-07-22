import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type {
  ExecutorCompatibilityReleaseDraftReaderPort,
  ReadExecutorCompatibilityReleaseDraftInput,
} from "#application/ports/executorCompatibilityReleaseDraftReader/index.js";
import type { HarnessError, Result } from "#common/index.js";
import type { ExecutorCompatibilityReleaseAttestationDraft } from "#domain/executorCompatibilityAttestation/index.js";
import type { ExecutorCompatibilityReleaseManifestAttestationDraft } from "#domain/executorCompatibilityReleaseManifestAttestation/index.js";

import { readReleaseDraft } from "../service/index.js";
import { validateAttestationDraft, validateManifestDraft } from "../validation/index.js";

/** Node 严格 Draft Reader Adapter。 */
export class NodeExecutorCompatibilityReleaseDraftReaderAdapter implements ExecutorCompatibilityReleaseDraftReaderPort {
  public constructor(private readonly digest: ContentDigestPort) {}

  /** 读取 Attestation Draft。 */
  public readAttestationDraft(
    input: ReadExecutorCompatibilityReleaseDraftInput,
  ): Promise<Result<ExecutorCompatibilityReleaseAttestationDraft, HarnessError>> {
    return readReleaseDraft(input.draftFilePath, this.digest, validateAttestationDraft);
  }

  /** 读取 Manifest Draft。 */
  public readManifestDraft(
    input: ReadExecutorCompatibilityReleaseDraftInput,
  ): Promise<Result<ExecutorCompatibilityReleaseManifestAttestationDraft, HarnessError>> {
    return readReleaseDraft(input.draftFilePath, this.digest, validateManifestDraft);
  }
}
