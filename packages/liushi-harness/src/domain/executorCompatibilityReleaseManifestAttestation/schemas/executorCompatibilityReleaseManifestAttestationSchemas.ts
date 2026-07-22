import { z } from "zod";

import { CONTENT_DIGEST_PATTERN, type ContentDigest } from "#common/index.js";
import { approvalRecordSchema, decisionRequestSchema } from "#domain/approval/index.js";
import {
  IN_TOTO_STATEMENT_V1_TYPE,
  executorCompatibilityPublisherIdentityPolicySchema,
} from "#domain/executorCompatibilityAttestation/index.js";
import { executorCompatibilityReleaseManifestSchema } from "#domain/executorCompatibilityReleaseManifest/index.js";
import { GateId } from "#domain/policy/index.js";

import {
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_TYPE,
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_G6_APPROVAL_BINDING_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SUBJECT_NAME,
} from "../constants/index.js";

const contentDigestSchema = z
  .string()
  .regex(CONTENT_DIGEST_PATTERN)
  .transform((value) => value as ContentDigest);
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/u);

/** Manifest-specific G6 Approval Binding 的严格 Schema。 */
export const executorCompatibilityReleaseManifestG6ApprovalBindingSchema = z
  .object({
    schemaVersion: z.literal(
      EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_G6_APPROVAL_BINDING_SCHEMA_VERSION,
    ),
    gate: z.literal(GateId.G6MergeRelease),
    decisionRequestDigest: contentDigestSchema,
    approvalRecordDigest: contentDigestSchema,
    manifestDigest: contentDigestSchema,
  })
  .strict();

/** Manifest Attestation Predicate 的严格 Schema。 */
export const executorCompatibilityReleaseManifestAttestationPredicateSchema = z
  .object({
    schemaVersion: z.literal(
      EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_SCHEMA_VERSION,
    ),
    manifest: executorCompatibilityReleaseManifestSchema,
    publisherIdentityPolicy: executorCompatibilityPublisherIdentityPolicySchema,
    g6Approval: executorCompatibilityReleaseManifestG6ApprovalBindingSchema,
  })
  .strict();

/** Manifest Attestation 单 Subject 的严格 Schema。 */
export const executorCompatibilityReleaseManifestAttestationSubjectSchema = z
  .object({
    name: z.literal(EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SUBJECT_NAME),
    digest: z.object({ sha256: sha256HexSchema }).strict(),
  })
  .strict();

/** Manifest Attestation 单 Subject in-toto Statement 的严格 Schema。 */
export const executorCompatibilityReleaseManifestAttestationStatementSchema = z
  .object({
    _type: z.literal(IN_TOTO_STATEMENT_V1_TYPE),
    subject: z.tuple([executorCompatibilityReleaseManifestAttestationSubjectSchema]),
    predicateType: z.literal(EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_TYPE),
    predicate: executorCompatibilityReleaseManifestAttestationPredicateSchema,
  })
  .strict();

/** Manifest Attestation Draft 的严格 Schema。 */
export const executorCompatibilityReleaseManifestAttestationDraftSchema = z
  .object({
    manifest: executorCompatibilityReleaseManifestSchema,
    publisherIdentityPolicy: executorCompatibilityPublisherIdentityPolicySchema,
    decisionRequest: decisionRequestSchema,
    approvalRecord: approvalRecordSchema,
    g6Approval: executorCompatibilityReleaseManifestG6ApprovalBindingSchema,
    statement: executorCompatibilityReleaseManifestAttestationStatementSchema,
  })
  .strict();

/** Manifest Attestation Draft 创建输入的严格 Schema。 */
export const executorCompatibilityReleaseManifestAttestationCreateInputSchema = z
  .object({
    manifest: executorCompatibilityReleaseManifestSchema,
    publisherIdentityPolicy: executorCompatibilityPublisherIdentityPolicySchema,
    decisionRequest: decisionRequestSchema,
    approvalRecord: approvalRecordSchema,
  })
  .strict();
