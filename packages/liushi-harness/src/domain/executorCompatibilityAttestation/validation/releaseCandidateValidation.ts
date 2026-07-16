import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import { validateExecutorCompatibilityPublicationBundle } from "#domain/executorCompatibilityPublication/index.js";

import {
  SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID,
  SIGSTORE_SOURCE_REPOSITORY_URI_OID,
} from "../constants/index.js";
import type {
  CreateExecutorCompatibilityReleaseCandidateInput,
  ExecutorCompatibilityAttestationDigestPort,
  ExecutorCompatibilityReleaseCandidate,
  ExecutorCompatibilityReleaseCandidateDigestInput,
} from "../contracts/index.js";
import { createExecutorCompatibilityReleaseCandidateDigestInput } from "../digest/index.js";
import {
  executorCompatibilityReleaseCandidateDigestInputSchema,
  executorCompatibilityReleaseCandidateSchema,
} from "../schemas/index.js";
import { validateExecutorCompatibilityPublisherIdentityPolicy } from "./publisherIdentityPolicyValidation.js";
import {
  attestationBindingMismatch,
  invalidAttestationInput,
  invalidAttestationSchema,
} from "./validationErrors.js";

/** 校验不含自身摘要的 Release Candidate 候选与 Bundle/Policy 精确绑定。 */
export function validateExecutorCompatibilityReleaseCandidateDigestInput(
  input: unknown,
  context: CreateExecutorCompatibilityReleaseCandidateInput,
  digestPort: ExecutorCompatibilityAttestationDigestPort,
): Result<ExecutorCompatibilityReleaseCandidateDigestInput, HarnessError> {
  const parsed = executorCompatibilityReleaseCandidateDigestInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidAttestationSchema(parsed.error, "Release Candidate Schema 非法。");
  }
  const bundle = validateExecutorCompatibilityPublicationBundle(context.bundle, digestPort);
  if (bundle.status === ResultStatus.Failure) return bundle;
  const policy = validateExecutorCompatibilityPublisherIdentityPolicy(
    context.publisherIdentityPolicy,
    digestPort,
  );
  if (policy.status === ResultStatus.Failure) return policy;
  const candidate = parsed.data;
  if (candidate.bundleDigest !== bundle.value.bundleDigest) {
    return attestationBindingMismatch(
      "Release Candidate Bundle Digest 与 Publication Bundle 不一致。",
    );
  }
  if (candidate.matrixDigest !== bundle.value.matrix.matrixDigest) {
    return attestationBindingMismatch(
      "Release Candidate Matrix Digest 与 Publication Bundle 不一致。",
    );
  }
  if (candidate.packageDigest !== bundle.value.releaseSubject.packageDigest) {
    return attestationBindingMismatch(
      "Release Candidate Package Digest 与 Publication Bundle 不一致。",
    );
  }
  if (candidate.publisherIdentityPolicyDigest !== policy.value.identityPolicyDigest) {
    return attestationBindingMismatch(
      "Release Candidate Publisher Identity Policy Digest 不一致。",
    );
  }
  if (!sameTarget(candidate.target, context.target)) {
    return attestationBindingMismatch("Release Candidate Publication Target 与请求目标不一致。");
  }
  const repositoryExtension = policy.value.certificateExtensions.find(
    (extension) => extension.oid === SIGSTORE_SOURCE_REPOSITORY_URI_OID,
  );
  if (repositoryExtension?.value !== bundle.value.releaseSubject.repositoryUri) {
    return attestationBindingMismatch(
      "Publisher Identity Policy 未绑定 Publication Bundle 的源码仓库。",
    );
  }
  const sourceRevisionExtension = policy.value.certificateExtensions.find(
    (extension) => extension.oid === SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID,
  );
  if (sourceRevisionExtension?.value !== bundle.value.releaseSubject.sourceRevision) {
    return attestationBindingMismatch(
      "Publisher Identity Policy 未绑定 Publication Bundle 的源码 Revision。",
    );
  }
  return success(candidate);
}

/** 校验完整 Release Candidate 的自身摘要及全部发布绑定。 */
export function validateExecutorCompatibilityReleaseCandidate(
  input: unknown,
  context: CreateExecutorCompatibilityReleaseCandidateInput,
  digestPort: ExecutorCompatibilityAttestationDigestPort,
): Result<ExecutorCompatibilityReleaseCandidate, HarnessError> {
  const parsed = executorCompatibilityReleaseCandidateSchema.safeParse(input);
  if (!parsed.success) {
    return invalidAttestationSchema(parsed.error, "Release Candidate Schema 非法。");
  }
  const semantics = validateExecutorCompatibilityReleaseCandidateDigestInput(
    createExecutorCompatibilityReleaseCandidateDigestInput(parsed.data),
    context,
    digestPort,
  );
  if (semantics.status === ResultStatus.Failure) return semantics;
  const digest = digestPort.calculate(
    createExecutorCompatibilityReleaseCandidateDigestInput(semantics.value),
  );
  if (digest.status === ResultStatus.Failure) return digest;
  return digest.value === parsed.data.candidateDigest
    ? success(parsed.data)
    : invalidAttestationInput("Release Candidate 摘要漂移。", {
        expectedCandidateDigest: digest.value,
        actualCandidateDigest: parsed.data.candidateDigest,
      });
}

function sameTarget(
  left: CreateExecutorCompatibilityReleaseCandidateInput["target"],
  right: CreateExecutorCompatibilityReleaseCandidateInput["target"],
): boolean {
  return left.kind === right.kind && left.uri === right.uri;
}
