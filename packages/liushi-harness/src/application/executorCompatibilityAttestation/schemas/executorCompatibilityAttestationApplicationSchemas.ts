import { z } from "zod";

import { CONTENT_DIGEST_PATTERN, type ContentDigest } from "#common/index.js";
import { approvalRecordSchema, decisionRequestSchema } from "#domain/approval/index.js";
import {
  executorCompatibilityAttestationStatementSchema,
  executorCompatibilityG6ApprovalBindingSchema,
  executorCompatibilityPublisherIdentityPolicySchema,
  executorCompatibilityReleaseCandidateSchema,
  type ExecutorCompatibilityReleaseAttestationDraft,
} from "#domain/executorCompatibilityAttestation/index.js";
import { executorCompatibilityPublicationBundleSchema } from "#domain/executorCompatibilityPublication/index.js";

import { EXECUTOR_COMPATIBILITY_SIGNED_ATTESTATION_ARTIFACT_SCHEMA_VERSION } from "../constants/index.js";
import type {
  ExecutorCompatibilitySigstoreBundleJson,
  ExecutorCompatibilitySignedAttestationArtifact,
  ExecutorCompatibilitySignedAttestationArtifactDigestInput,
  ExecutorCompatibilityTrustedRootJson,
} from "../contracts/index.js";

const contentDigestSchema = z
  .string()
  .regex(CONTENT_DIGEST_PATTERN)
  .transform((value) => value as ContentDigest);

const jsonObjectWithMediaTypeSchema = z.object({ mediaType: z.string().min(1) }).catchall(z.json());

/** P3a Draft 全部重复绑定字段的严格运行时 Schema。 */
export const executorCompatibilityReleaseAttestationDraftSchema = z
  .object({
    bundle: executorCompatibilityPublicationBundleSchema,
    publisherIdentityPolicy: executorCompatibilityPublisherIdentityPolicySchema,
    releaseCandidate: executorCompatibilityReleaseCandidateSchema,
    decisionRequest: decisionRequestSchema,
    approvalRecord: approvalRecordSchema,
    g6Approval: executorCompatibilityG6ApprovalBindingSchema,
    statement: executorCompatibilityAttestationStatementSchema,
  })
  .strict()
  .transform((value) => value as unknown as ExecutorCompatibilityReleaseAttestationDraft);

/** Sigstore Bundle JSON 的最小跨层 Schema；密码学结构由官方 Parser 复验。 */
export const executorCompatibilitySigstoreBundleJsonSchema =
  jsonObjectWithMediaTypeSchema.transform(
    (value) => value as ExecutorCompatibilitySigstoreBundleJson,
  );

/** 显式 Trusted Root JSON 的最小跨层 Schema；信任材料由官方 Parser 复验。 */
export const executorCompatibilityTrustedRootJsonSchema = jsonObjectWithMediaTypeSchema.transform(
  (value) => value as ExecutorCompatibilityTrustedRootJson,
);

const signedAttestationArtifactDigestInputObjectSchema = z
  .object({
    schemaVersion: z.literal(EXECUTOR_COMPATIBILITY_SIGNED_ATTESTATION_ARTIFACT_SCHEMA_VERSION),
    draft: executorCompatibilityReleaseAttestationDraftSchema,
    statementDigest: contentDigestSchema,
    sigstoreBundle: executorCompatibilitySigstoreBundleJsonSchema,
    sigstoreBundleDigest: contentDigestSchema,
  })
  .strict();

/** 不含自身摘要的签名 Artifact Schema。 */
export const executorCompatibilitySignedAttestationArtifactDigestInputSchema =
  signedAttestationArtifactDigestInputObjectSchema.transform(
    (value) => value as ExecutorCompatibilitySignedAttestationArtifactDigestInput,
  );

/** 完整签名 Artifact Schema。 */
export const executorCompatibilitySignedAttestationArtifactSchema =
  signedAttestationArtifactDigestInputObjectSchema
    .extend({ artifactDigest: contentDigestSchema })
    .strict()
    .transform((value) => value as ExecutorCompatibilitySignedAttestationArtifact);
