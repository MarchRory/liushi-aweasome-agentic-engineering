import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import { rebuildExecutorCompatibilityReleaseAttestationDraft } from "#application/executorCompatibilityAttestation/index.js";
import type { HarnessError, Result } from "#common/index.js";
import type { ExecutorCompatibilityReleaseAttestationDraft } from "#domain/executorCompatibilityAttestation/index.js";
import {
  rebuildExecutorCompatibilityReleaseManifestAttestationDraft,
  type ExecutorCompatibilityReleaseManifestAttestationDraft,
} from "#domain/executorCompatibilityReleaseManifestAttestation/index.js";

/** 重建 Attestation Draft，确保持久化值重新通过领域校验。 */
export function validateAttestationDraft(
  input: unknown,
  digest: ContentDigestPort,
): Result<ExecutorCompatibilityReleaseAttestationDraft, HarnessError> {
  return rebuildExecutorCompatibilityReleaseAttestationDraft(input, digest);
}

/** 重建 Manifest Draft，确保持久化值重新通过领域校验。 */
export function validateManifestDraft(
  input: unknown,
  digest: ContentDigestPort,
): Result<ExecutorCompatibilityReleaseManifestAttestationDraft, HarnessError> {
  return rebuildExecutorCompatibilityReleaseManifestAttestationDraft(input, digest);
}
