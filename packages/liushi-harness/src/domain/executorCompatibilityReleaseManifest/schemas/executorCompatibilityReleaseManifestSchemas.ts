import { z } from "zod";

import { CONTENT_DIGEST_PATTERN, type ContentDigest } from "#common/index.js";
import {
  executorHostScopeSchema,
  ExecutorSupportLevel,
  type ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";
import {
  executorCompatibilityReleaseSubjectSchema,
  type ExecutorCompatibilityReleaseSubject,
} from "#domain/executorCompatibilityPublication/index.js";
import {
  EXECUTOR_COMPATIBILITY_ATTESTATION_URI_MAX_LENGTH,
  executorCompatibilityPublicationTargetSchema,
  type ExecutorCompatibilityPublicationTarget,
} from "#domain/executorCompatibilityAttestation/index.js";

import {
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ARTIFACT_COUNT,
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SCHEMA_VERSION,
} from "../constants/index.js";
import { ExecutorCompatibilityReleaseArtifactKind } from "../enums/index.js";

const contentDigestSchema = z
  .string()
  .regex(CONTENT_DIGEST_PATTERN)
  .transform((value) => value as ContentDigest);

const typedReleaseSubjectSchema = executorCompatibilityReleaseSubjectSchema.transform(
  (value) => value as ExecutorCompatibilityReleaseSubject,
);
const typedTargetSchema = executorCompatibilityPublicationTargetSchema.transform(
  (value) => value as ExecutorCompatibilityPublicationTarget,
);
const typedScopeSchema = executorHostScopeSchema.transform((value) => value as ExecutorHostScope);

/** Release Manifest Artifact Kind 的严格 Schema。 */
export const executorCompatibilityReleaseArtifactKindSchema = z.enum(
  ExecutorCompatibilityReleaseArtifactKind,
);

/** Release Manifest Artifact 引用的严格 Schema。 */
export const executorCompatibilityReleaseArtifactReferenceSchema = z
  .object({
    kind: executorCompatibilityReleaseArtifactKindSchema,
    uri: z
      .string()
      .min(1)
      .max(EXECUTOR_COMPATIBILITY_ATTESTATION_URI_MAX_LENGTH)
      .refine(isCanonicalHttpsResourceUri),
    digest: contentDigestSchema,
    byteLength: z.number().refine(isPositiveSafeInteger),
  })
  .strict();

/** P3b 完整性校验结果提供的签名发布证明绑定 Schema。 */
export const executorCompatibilityVerifiedReleaseAttestationBindingSchema = z
  .object({
    artifactDigest: contentDigestSchema,
    statementDigest: contentDigestSchema,
    sigstoreBundleDigest: contentDigestSchema,
  })
  .strict();

/** 排除 Manifest 自身摘要的严格 Schema。 */
export const executorCompatibilityReleaseManifestDigestInputSchema = z
  .object({
    schemaVersion: z.literal(EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SCHEMA_VERSION),
    predecessorManifestDigest: contentDigestSchema.optional(),
    releaseSubject: typedReleaseSubjectSchema,
    target: typedTargetSchema,
    releaseCandidateDigest: contentDigestSchema,
    publisherIdentityPolicyDigest: contentDigestSchema,
    executorScope: typedScopeSchema,
    supportLevel: z.enum(ExecutorSupportLevel),
    matrixDigest: contentDigestSchema,
    attestationStatementDigest: contentDigestSchema,
    sigstoreBundleDigest: contentDigestSchema,
    artifacts: z
      .array(executorCompatibilityReleaseArtifactReferenceSchema)
      .length(EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ARTIFACT_COUNT),
  })
  .strict();

/** 完整 Release Manifest 的严格 Schema。 */
export const executorCompatibilityReleaseManifestSchema =
  executorCompatibilityReleaseManifestDigestInputSchema
    .extend({ manifestDigest: contentDigestSchema })
    .strict();

/** Release Manifest 创建输入的严格顶层 Schema。 */
export const executorCompatibilityReleaseManifestCreateInputSchema = z
  .object({
    draft: z.unknown(),
    packageTarball: executorCompatibilityReleaseArtifactReferenceSchema,
    publicationBundle: executorCompatibilityReleaseArtifactReferenceSchema,
    signedReleaseAttestation: executorCompatibilityReleaseArtifactReferenceSchema,
    verifiedAttestation: executorCompatibilityVerifiedReleaseAttestationBindingSchema,
    predecessorManifestDigest: contentDigestSchema.optional(),
  })
  .strict();

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isCanonicalHttpsResourceUri(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0 &&
      parsed.pathname !== "/" &&
      !parsed.pathname.endsWith("/") &&
      value === `${parsed.origin}${parsed.pathname}`
    );
  } catch {
    return false;
  }
}
