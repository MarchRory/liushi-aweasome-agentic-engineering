import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { approvalRecordSchema, decisionRequestSchema } from "#domain/approval/index.js";
import {
  createExecutorCompatibilityReleaseAttestationDraft,
  executorCompatibilityAttestationStatementSchema,
  executorCompatibilityG6ApprovalBindingSchema,
  executorCompatibilityPublisherIdentityPolicySchema,
  executorCompatibilityReleaseCandidateSchema,
} from "#domain/executorCompatibilityAttestation/index.js";
import type {
  CreateExecutorCompatibilityReleaseAttestationDraftInput,
  ExecutorCompatibilityReleaseAttestationDraft,
} from "#domain/executorCompatibilityAttestation/index.js";
import { executorCompatibilityPublicationBundleSchema } from "#domain/executorCompatibilityPublication/index.js";

import {
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ARTIFACT_ORDER,
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SCHEMA_VERSION,
} from "../constants/index.js";
import type {
  ExecutorCompatibilityReleaseArtifactReference,
  ExecutorCompatibilityReleaseManifest,
  ExecutorCompatibilityReleaseManifestDigestInput,
  ExecutorCompatibilityReleaseManifestDigestPort,
  ExecutorCompatibilityVerifiedReleaseAttestationBinding,
} from "../contracts/index.js";
import { createExecutorCompatibilityReleaseManifestDigestInput } from "../digest/index.js";
import {
  executorCompatibilityReleaseManifestDigestInputSchema,
  executorCompatibilityReleaseManifestSchema,
  executorCompatibilityVerifiedReleaseAttestationBindingSchema,
} from "../schemas/index.js";

const executorCompatibilityReleaseAttestationDraftSchema = z
  .object({
    bundle: executorCompatibilityPublicationBundleSchema,
    publisherIdentityPolicy: executorCompatibilityPublisherIdentityPolicySchema,
    releaseCandidate: executorCompatibilityReleaseCandidateSchema,
    decisionRequest: decisionRequestSchema,
    approvalRecord: approvalRecordSchema,
    g6Approval: executorCompatibilityG6ApprovalBindingSchema,
    statement: executorCompatibilityAttestationStatementSchema,
  })
  .strict();

/** 将 unknown Draft 严格解析后重建为本 Manifest 的来源 Draft。 */
export function rebuildExecutorCompatibilityReleaseManifestSourceDraft(
  input: unknown,
  digestPort: ExecutorCompatibilityReleaseManifestDigestPort,
): Result<ExecutorCompatibilityReleaseAttestationDraft, HarnessError> {
  const parsed = executorCompatibilityReleaseAttestationDraftSchema.safeParse(input);
  if (!parsed.success) return invalid("Release Attestation Draft Schema 非法。");
  const draftInput =
    parsed.data as unknown as CreateExecutorCompatibilityReleaseAttestationDraftInput;
  const rebuilt = createExecutorCompatibilityReleaseAttestationDraft(
    {
      bundle: draftInput.bundle,
      publisherIdentityPolicy: draftInput.publisherIdentityPolicy,
      releaseCandidate: draftInput.releaseCandidate,
      decisionRequest: draftInput.decisionRequest,
      approvalRecord: draftInput.approvalRecord,
    },
    digestPort,
  );
  if (rebuilt.status === ResultStatus.Failure) return rebuilt;
  const equal = sameCanonical(parsed.data, rebuilt.value, digestPort);
  if (equal.status === ResultStatus.Failure) return equal;
  return equal.value
    ? success(rebuilt.value)
    : invalid("Release Attestation Draft 重建结果不一致。");
}

/** 校验不含自身摘要的 Manifest，并重建其完整 Attestation Draft。 */
export function validateExecutorCompatibilityReleaseManifestDigestInput(
  input: unknown,
  draft: unknown,
  verifiedAttestation: unknown,
  digestPort: ExecutorCompatibilityReleaseManifestDigestPort,
): Result<ExecutorCompatibilityReleaseManifestDigestInput, HarnessError> {
  const parsed = executorCompatibilityReleaseManifestDigestInputSchema.safeParse(input);
  if (!parsed.success) return invalid("Release Manifest 摘要输入 Schema 非法。");
  const candidate: ExecutorCompatibilityReleaseManifestDigestInput = {
    schemaVersion: parsed.data.schemaVersion,
    ...(parsed.data.predecessorManifestDigest === undefined
      ? {}
      : { predecessorManifestDigest: parsed.data.predecessorManifestDigest }),
    releaseSubject: parsed.data.releaseSubject,
    target: parsed.data.target,
    releaseCandidateDigest: parsed.data.releaseCandidateDigest,
    publisherIdentityPolicyDigest: parsed.data.publisherIdentityPolicyDigest,
    executorScope: parsed.data.executorScope,
    supportLevel: parsed.data.supportLevel,
    matrixDigest: parsed.data.matrixDigest,
    attestationStatementDigest: parsed.data.attestationStatementDigest,
    sigstoreBundleDigest: parsed.data.sigstoreBundleDigest,
    artifacts: parsed.data.artifacts,
  };
  const rebuilt = rebuildExecutorCompatibilityReleaseManifestSourceDraft(draft, digestPort);
  if (rebuilt.status === ResultStatus.Failure) return rebuilt;
  const parsedBinding =
    executorCompatibilityVerifiedReleaseAttestationBindingSchema.safeParse(verifiedAttestation);
  if (!parsedBinding.success) return invalid("Verified Attestation Binding Schema 非法。");
  const semantics = validateBindings(candidate, rebuilt.value, parsedBinding.data, digestPort);
  return semantics.status === ResultStatus.Failure ? semantics : success(candidate);
}

/** 校验完整 Manifest、Draft 交叉绑定、规范顺序与 Manifest 摘要。 */
export function validateExecutorCompatibilityReleaseManifest(
  input: unknown,
  draft: unknown,
  verifiedAttestation: unknown,
  digestPort: ExecutorCompatibilityReleaseManifestDigestPort,
): Result<ExecutorCompatibilityReleaseManifest, HarnessError> {
  const integrity = validateExecutorCompatibilityReleaseManifestIntegrity(input, digestPort);
  if (integrity.status === ResultStatus.Failure) return integrity;
  const manifest = integrity.value;
  const digestInput: ExecutorCompatibilityReleaseManifestDigestInput = {
    schemaVersion: manifest.schemaVersion,
    ...(manifest.predecessorManifestDigest === undefined
      ? {}
      : { predecessorManifestDigest: manifest.predecessorManifestDigest }),
    releaseSubject: manifest.releaseSubject,
    target: manifest.target,
    releaseCandidateDigest: manifest.releaseCandidateDigest,
    publisherIdentityPolicyDigest: manifest.publisherIdentityPolicyDigest,
    executorScope: manifest.executorScope,
    supportLevel: manifest.supportLevel,
    matrixDigest: manifest.matrixDigest,
    attestationStatementDigest: manifest.attestationStatementDigest,
    sigstoreBundleDigest: manifest.sigstoreBundleDigest,
    artifacts: manifest.artifacts,
  };
  const validated = validateExecutorCompatibilityReleaseManifestDigestInput(
    digestInput,
    draft,
    verifiedAttestation,
    digestPort,
  );
  if (validated.status === ResultStatus.Failure) return validated;
  return success(manifest);
}

/** 只校验完整 Manifest 的严格 Schema、固定 Artifact 顺序与自身摘要。 */
export function validateExecutorCompatibilityReleaseManifestIntegrity(
  input: unknown,
  digestPort: ExecutorCompatibilityReleaseManifestDigestPort,
): Result<ExecutorCompatibilityReleaseManifest, HarnessError> {
  const parsed = executorCompatibilityReleaseManifestSchema.safeParse(input);
  if (!parsed.success) return invalid("Release Manifest Schema 非法。");
  const manifest = parsed.data as unknown as ExecutorCompatibilityReleaseManifest;
  if (
    manifest.artifacts.length !== EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ARTIFACT_ORDER.length ||
    manifest.artifacts.some(
      (artifact, index) =>
        artifact.kind !== EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ARTIFACT_ORDER[index],
    )
  ) {
    return invalid("Release Manifest Artifact 缺失、重复或顺序非法。");
  }
  const digest = digestPort.calculate(
    createExecutorCompatibilityReleaseManifestDigestInput(manifest),
  );
  if (digest.status === ResultStatus.Failure) return digest;
  return digest.value === manifest.manifestDigest
    ? success(manifest)
    : invalid("Release Manifest 摘要漂移。", {
        expectedManifestDigest: digest.value,
        actualManifestDigest: manifest.manifestDigest,
      });
}

function validateBindings(
  manifest: ExecutorCompatibilityReleaseManifestDigestInput,
  draft: ExecutorCompatibilityReleaseAttestationDraft,
  verifiedAttestation: ExecutorCompatibilityVerifiedReleaseAttestationBinding,
  digestPort: ExecutorCompatibilityReleaseManifestDigestPort,
): Result<void, HarnessError> {
  const statementDigest = digestPort.calculate(draft.statement);
  if (statementDigest.status === ResultStatus.Failure) return statementDigest;
  if (statementDigest.value !== manifest.attestationStatementDigest) {
    return invalid("Attestation Statement 摘要与 Draft 不一致。", {
      expectedStatementDigest: statementDigest.value,
      actualStatementDigest: manifest.attestationStatementDigest,
    });
  }
  if (manifest.attestationStatementDigest !== verifiedAttestation.statementDigest) {
    return invalid("Attestation Statement 摘要与 P3b 校验结果不一致。", {
      expectedStatementDigest: verifiedAttestation.statementDigest,
      actualStatementDigest: manifest.attestationStatementDigest,
    });
  }
  if (manifest.sigstoreBundleDigest !== verifiedAttestation.sigstoreBundleDigest) {
    return invalid("Sigstore Bundle 摘要与 P3b 校验结果不一致。", {
      expectedSigstoreBundleDigest: verifiedAttestation.sigstoreBundleDigest,
      actualSigstoreBundleDigest: manifest.sigstoreBundleDigest,
    });
  }
  const fieldChecks: readonly [string, unknown, unknown][] = [
    ["releaseSubject", manifest.releaseSubject, draft.bundle.releaseSubject],
    ["target", manifest.target, draft.releaseCandidate.target],
    ["executorScope", manifest.executorScope, draft.bundle.matrix.scope],
  ];
  for (const [field, actual, expected] of fieldChecks) {
    const equal = sameCanonical(actual, expected, digestPort);
    if (equal.status === ResultStatus.Failure) return equal;
    if (!equal.value) return invalid(`Release Manifest ${field} 与 Draft 不一致。`);
  }
  if (manifest.schemaVersion !== EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SCHEMA_VERSION) {
    return invalid("Release Manifest Schema Version 不一致。");
  }
  if (manifest.releaseCandidateDigest !== draft.releaseCandidate.candidateDigest) {
    return invalid("Release Candidate Digest 与 Draft 不一致。");
  }
  if (
    manifest.publisherIdentityPolicyDigest !== draft.publisherIdentityPolicy.identityPolicyDigest
  ) {
    return invalid("Publisher Identity Policy Digest 与 Draft 不一致。");
  }
  if (manifest.supportLevel !== draft.bundle.matrix.supportLevel) {
    return invalid("Support Level 与 Draft 不一致。");
  }
  if (manifest.matrixDigest !== draft.bundle.matrix.matrixDigest) {
    return invalid("Matrix Digest 与 Draft 不一致。");
  }
  return validateArtifacts(manifest.artifacts, draft, verifiedAttestation);
}

function validateArtifacts(
  artifacts: readonly ExecutorCompatibilityReleaseArtifactReference[],
  draft: ExecutorCompatibilityReleaseAttestationDraft,
  verifiedAttestation: ExecutorCompatibilityVerifiedReleaseAttestationBinding,
): Result<void, HarnessError> {
  if (artifacts.length !== EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ARTIFACT_ORDER.length)
    return invalid("Release Manifest Artifact 数量非法。");
  if (
    artifacts.some(
      (artifact, index) =>
        artifact.kind !== EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ARTIFACT_ORDER[index],
    )
  ) {
    return invalid("Release Manifest Artifact 缺失、重复或顺序非法。");
  }
  const [packageTarball, publicationBundle, signedReleaseAttestation] = artifacts;
  if (packageTarball?.digest !== draft.bundle.releaseSubject.packageDigest) {
    return invalid("Package Tarball Digest 与 Draft 不一致。");
  }
  if (publicationBundle?.digest !== draft.bundle.bundleDigest) {
    return invalid("Publication Bundle Digest 与 Draft 不一致。");
  }
  if (signedReleaseAttestation?.digest !== verifiedAttestation.artifactDigest) {
    return invalid("Signed Release Attestation Digest 与 P3b 校验结果不一致。");
  }
  return success(undefined);
}

function sameCanonical(
  left: unknown,
  right: unknown,
  digestPort: ExecutorCompatibilityReleaseManifestDigestPort,
): Result<boolean, HarnessError> {
  const leftDigest = digestPort.calculate(left);
  if (leftDigest.status === ResultStatus.Failure) return leftDigest;
  const rightDigest = digestPort.calculate(right);
  if (rightDigest.status === ResultStatus.Failure) return rightDigest;
  return success(leftDigest.value === rightDigest.value);
}

function invalid(
  message: string,
  details: Readonly<Record<string, string>> = {},
): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, details));
}
