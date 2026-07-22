import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type ContentDigest,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  createExecutorCompatibilityReleaseAttestationDraft,
  type ExecutorCompatibilityPublisherIdentityPolicy,
  type ExecutorCompatibilityReleaseAttestationDraft,
} from "#domain/executorCompatibilityAttestation/index.js";

import type {
  ExecutorCompatibilitySignedAttestationArtifact,
  ExecutorCompatibilityTrustedRootJson,
  ExecutorCompatibilityVerifiedSignerIdentity,
} from "../contracts/index.js";
import {
  executorCompatibilityReleaseAttestationDraftSchema,
  executorCompatibilitySignedAttestationArtifactSchema,
  executorCompatibilityTrustedRootJsonSchema,
} from "../schemas/index.js";

/** 从五项权威输入重新构建 Draft，并拒绝任何重复字段漂移。 */
export function rebuildExecutorCompatibilityReleaseAttestationDraft(
  input: unknown,
  digest: ContentDigestPort,
): Result<ExecutorCompatibilityReleaseAttestationDraft, HarnessErrorType> {
  const parsed = executorCompatibilityReleaseAttestationDraftSchema.safeParse(input);
  if (!parsed.success) return invalidAttestationInput("Release Attestation Draft Schema 非法。");
  const rebuilt = createExecutorCompatibilityReleaseAttestationDraft(
    {
      bundle: parsed.data.bundle,
      publisherIdentityPolicy: parsed.data.publisherIdentityPolicy,
      releaseCandidate: parsed.data.releaseCandidate,
      decisionRequest: parsed.data.decisionRequest,
      approvalRecord: parsed.data.approvalRecord,
    },
    digest,
  );
  if (rebuilt.status === ResultStatus.Failure) return rebuilt;
  const suppliedDigest = digest.calculate(parsed.data);
  if (suppliedDigest.status === ResultStatus.Failure) return suppliedDigest;
  const rebuiltDigest = digest.calculate(rebuilt.value);
  if (rebuiltDigest.status === ResultStatus.Failure) return rebuiltDigest;
  return suppliedDigest.value === rebuiltDigest.value
    ? success(rebuilt.value)
    : invalidAttestationInput("Release Attestation Draft 的重复绑定字段发生漂移。");
}

/** 重新计算签名 Artifact、Statement 与 Sigstore Bundle 的全部摘要。 */
export function validateExecutorCompatibilitySignedAttestationArtifact(
  input: unknown,
  digest: ContentDigestPort,
): Result<ExecutorCompatibilitySignedAttestationArtifact, HarnessErrorType> {
  const parsed = executorCompatibilitySignedAttestationArtifactSchema.safeParse(input);
  if (!parsed.success) return invalidAttestationInput("Signed Attestation Artifact Schema 非法。");
  const draft = rebuildExecutorCompatibilityReleaseAttestationDraft(parsed.data.draft, digest);
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
    return invalidAttestationInput("Signed Attestation Artifact 摘要漂移。");
  }
  return success({
    ...parsed.data,
    draft: draft.value,
  });
}

/** 校验调用方显式提供且可计算稳定摘要的 Trusted Root JSON。 */
export function validateExecutorCompatibilityTrustedRootJson(
  input: unknown,
  digest: ContentDigestPort,
): Result<
  Readonly<{ trustedRoot: ExecutorCompatibilityTrustedRootJson; digest: ContentDigest }>,
  HarnessErrorType
> {
  const parsed = executorCompatibilityTrustedRootJsonSchema.safeParse(input);
  if (!parsed.success) return invalidAttestationInput("Sigstore Trusted Root JSON 非法。");
  const trustedRootDigest = digest.calculate(parsed.data);
  return trustedRootDigest.status === ResultStatus.Failure
    ? trustedRootDigest
    : success({ trustedRoot: parsed.data, digest: trustedRootDigest.value });
}

/** 要求证书实际身份与完整 Publisher Identity Policy 精确一致。 */
export function requireExactExecutorCompatibilitySignerIdentity(
  actual: ExecutorCompatibilityVerifiedSignerIdentity,
  policy: ExecutorCompatibilityPublisherIdentityPolicy,
): Result<ExecutorCompatibilityVerifiedSignerIdentity, HarnessErrorType> {
  const extensionsMatch =
    actual.certificateExtensions.length === policy.certificateExtensions.length &&
    policy.certificateExtensions.every(
      (expected) =>
        actual.certificateExtensions.filter(
          (candidate) => candidate.oid === expected.oid && candidate.value === expected.value,
        ).length === 1,
    );
  if (
    actual.certificateIssuer !== policy.certificateIssuer ||
    actual.certificateIdentity !== policy.certificateIdentity.value ||
    !extensionsMatch
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed,
        "Sigstore 证书身份与 Publisher Identity Policy 不一致。",
      ),
    );
  }
  return success(actual);
}

function invalidAttestationInput(message: string): Result<never, HarnessErrorType> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
