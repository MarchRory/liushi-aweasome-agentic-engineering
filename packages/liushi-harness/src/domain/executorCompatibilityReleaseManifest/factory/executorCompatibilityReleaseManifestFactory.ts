import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";
import { EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CreateExecutorCompatibilityReleaseManifestInput,
  ExecutorCompatibilityReleaseManifest,
  ExecutorCompatibilityReleaseManifestDigestInput,
  ExecutorCompatibilityReleaseManifestDigestPort,
} from "../contracts/index.js";
import {
  createExecutorCompatibilityReleaseManifestDigestInput,
  normalizeExecutorCompatibilityReleaseArtifacts,
} from "../digest/index.js";
import { executorCompatibilityReleaseManifestCreateInputSchema } from "../schemas/index.js";
import {
  rebuildExecutorCompatibilityReleaseManifestSourceDraft,
  validateExecutorCompatibilityReleaseManifest,
} from "../validation/index.js";

/** 从完整 Draft 和三个 Artifact 引用创建稳定的 Release Manifest。 */
export function createExecutorCompatibilityReleaseManifest(
  input: CreateExecutorCompatibilityReleaseManifestInput,
  digestPort: ExecutorCompatibilityReleaseManifestDigestPort,
): Result<ExecutorCompatibilityReleaseManifest, HarnessError> {
  const parsed = executorCompatibilityReleaseManifestCreateInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Release Manifest 创建输入 Schema 非法。"),
    );
  }
  const draft = rebuildExecutorCompatibilityReleaseManifestSourceDraft(
    parsed.data.draft,
    digestPort,
  );
  if (draft.status === ResultStatus.Failure) return draft;
  const candidate: ExecutorCompatibilityReleaseManifestDigestInput = {
    schemaVersion: EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SCHEMA_VERSION,
    ...(parsed.data.predecessorManifestDigest === undefined
      ? {}
      : { predecessorManifestDigest: parsed.data.predecessorManifestDigest }),
    releaseSubject: { ...draft.value.bundle.releaseSubject },
    target: { ...draft.value.releaseCandidate.target },
    releaseCandidateDigest: draft.value.releaseCandidate.candidateDigest,
    publisherIdentityPolicyDigest: draft.value.publisherIdentityPolicy.identityPolicyDigest,
    executorScope: { ...draft.value.bundle.matrix.scope },
    supportLevel: draft.value.bundle.matrix.supportLevel,
    matrixDigest: draft.value.bundle.matrix.matrixDigest,
    attestationStatementDigest: parsed.data.verifiedAttestation.statementDigest,
    sigstoreBundleDigest: parsed.data.verifiedAttestation.sigstoreBundleDigest,
    artifacts: normalizeExecutorCompatibilityReleaseArtifacts([
      { ...parsed.data.packageTarball },
      { ...parsed.data.publicationBundle },
      { ...parsed.data.signedReleaseAttestation },
    ]),
  };
  const digest = digestPort.calculate(
    createExecutorCompatibilityReleaseManifestDigestInput(candidate),
  );
  if (digest.status === ResultStatus.Failure) return digest;
  return validateExecutorCompatibilityReleaseManifest(
    { ...candidate, manifestDigest: digest.value },
    parsed.data.draft,
    parsed.data.verifiedAttestation,
    digestPort,
  );
}
