import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import { rebuildExecutorCompatibilityReleaseManifestAttestationDraft } from "#domain/executorCompatibilityReleaseManifestAttestation/index.js";

import type { ExecutorCompatibilitySignedReleaseManifestArtifact } from "../contracts/index.js";
import { executorCompatibilitySignedReleaseManifestArtifactSchema } from "../schemas/index.js";

/** 重算 Draft、Statement、Bundle 与 Artifact 的全部内容摘要。 */
export function validateExecutorCompatibilitySignedReleaseManifestArtifact(
  input: unknown,
  digest: ContentDigestPort,
): Result<ExecutorCompatibilitySignedReleaseManifestArtifact, HarnessErrorType> {
  const parsed = executorCompatibilitySignedReleaseManifestArtifactSchema.safeParse(input);
  if (!parsed.success) return invalid("Signed Release Manifest Artifact Schema 非法。");
  const draft = rebuildExecutorCompatibilityReleaseManifestAttestationDraft(
    parsed.data.draft,
    digest,
  );
  if (draft.status === ResultStatus.Failure) return draft;
  const statementDigest = digest.calculate(draft.value.statement);
  if (statementDigest.status === ResultStatus.Failure) return statementDigest;
  const sigstoreBundleDigest = digest.calculate(parsed.data.sigstoreBundle);
  if (sigstoreBundleDigest.status === ResultStatus.Failure) return sigstoreBundleDigest;
  const artifactDigest = digest.calculate({
    schemaVersion: parsed.data.schemaVersion,
    draft: draft.value,
    statementDigest: statementDigest.value,
    sigstoreBundle: parsed.data.sigstoreBundle,
    sigstoreBundleDigest: sigstoreBundleDigest.value,
  });
  if (artifactDigest.status === ResultStatus.Failure) return artifactDigest;
  if (
    parsed.data.statementDigest !== statementDigest.value ||
    parsed.data.sigstoreBundleDigest !== sigstoreBundleDigest.value ||
    parsed.data.artifactDigest !== artifactDigest.value
  ) {
    return invalid("Signed Release Manifest Artifact 摘要漂移。");
  }
  return success({ ...parsed.data, draft: draft.value });
}

function invalid(message: string): Result<never, HarnessErrorType> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
