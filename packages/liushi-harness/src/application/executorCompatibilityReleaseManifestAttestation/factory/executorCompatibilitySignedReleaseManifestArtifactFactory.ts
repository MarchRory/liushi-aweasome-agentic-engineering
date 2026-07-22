import { executorCompatibilitySigstoreBundleJsonSchema } from "#application/executorCompatibilityAttestation/index.js";
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

import { EXECUTOR_COMPATIBILITY_SIGNED_RELEASE_MANIFEST_ARTIFACT_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CreateExecutorCompatibilitySignedReleaseManifestArtifactInput,
  ExecutorCompatibilitySignedReleaseManifestArtifact,
} from "../contracts/index.js";

/** 从已复验 Manifest Draft 与 Sigstore Bundle 创建内容寻址 Artifact。 */
export function createExecutorCompatibilitySignedReleaseManifestArtifact(
  input: CreateExecutorCompatibilitySignedReleaseManifestArtifactInput,
  digest: ContentDigestPort,
): Result<ExecutorCompatibilitySignedReleaseManifestArtifact, HarnessErrorType> {
  const draft = rebuildExecutorCompatibilityReleaseManifestAttestationDraft(input.draft, digest);
  if (draft.status === ResultStatus.Failure) return draft;
  const sigstoreBundle = executorCompatibilitySigstoreBundleJsonSchema.safeParse(
    input.sigstoreBundle,
  );
  if (!sigstoreBundle.success) {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "Sigstore Bundle JSON 非法。"));
  }
  const statementDigest = digest.calculate(draft.value.statement);
  if (statementDigest.status === ResultStatus.Failure) return statementDigest;
  const sigstoreBundleDigest = digest.calculate(sigstoreBundle.data);
  if (sigstoreBundleDigest.status === ResultStatus.Failure) return sigstoreBundleDigest;
  const digestInput = {
    schemaVersion: EXECUTOR_COMPATIBILITY_SIGNED_RELEASE_MANIFEST_ARTIFACT_SCHEMA_VERSION,
    draft: draft.value,
    statementDigest: statementDigest.value,
    sigstoreBundle: sigstoreBundle.data,
    sigstoreBundleDigest: sigstoreBundleDigest.value,
  } as const;
  const artifactDigest = digest.calculate(digestInput);
  return artifactDigest.status === ResultStatus.Failure
    ? artifactDigest
    : success({ ...digestInput, artifactDigest: artifactDigest.value });
}
