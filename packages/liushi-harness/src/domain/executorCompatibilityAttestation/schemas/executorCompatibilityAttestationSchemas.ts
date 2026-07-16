import { z } from "zod";

import { CONTENT_DIGEST_PATTERN, type ContentDigest } from "#common/index.js";
import {
  executorHostScopeSchema,
  type ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";
import {
  executorCompatibilityReleaseSubjectSchema,
  type ExecutorCompatibilityReleaseSubject,
} from "#domain/executorCompatibilityPublication/index.js";
import { GateId } from "#domain/policy/index.js";

import {
  EXECUTOR_COMPATIBILITY_ATTESTATION_EMAIL_MAX_LENGTH,
  EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_TYPE,
  EXECUTOR_COMPATIBILITY_ATTESTATION_URI_MAX_LENGTH,
  EXECUTOR_COMPATIBILITY_CERTIFICATE_EXTENSION_VALUE_MAX_LENGTH,
  EXECUTOR_COMPATIBILITY_CERTIFICATE_OID_PATTERN,
  EXECUTOR_COMPATIBILITY_G6_APPROVAL_BINDING_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_MAXIMUM_LOG_THRESHOLD,
  EXECUTOR_COMPATIBILITY_MINIMUM_CT_LOG_THRESHOLD,
  EXECUTOR_COMPATIBILITY_MINIMUM_TLOG_THRESHOLD,
  EXECUTOR_COMPATIBILITY_PUBLISHER_IDENTITY_POLICY_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_CANDIDATE_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SUBJECT_NAME,
  IN_TOTO_STATEMENT_V1_TYPE,
} from "../constants/index.js";
import {
  ExecutorCompatibilityCertificateIdentityKind,
  ExecutorCompatibilityPublicationTargetKind,
} from "../enums/index.js";

const contentDigestSchema = z
  .string()
  .regex(CONTENT_DIGEST_PATTERN)
  .transform((value) => value as ContentDigest);
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const canonicalHttpsUriSchema = z
  .string()
  .min(1)
  .max(EXECUTOR_COMPATIBILITY_ATTESTATION_URI_MAX_LENGTH)
  .refine(isCanonicalHttpsUri);
const canonicalHttpsResourceUriSchema = canonicalHttpsUriSchema.refine(hasConcreteResourcePath);
const exactEmailSchema = z
  .email()
  .max(EXECUTOR_COMPATIBILITY_ATTESTATION_EMAIL_MAX_LENGTH)
  .refine((value) => value === value.trim());
const typedReleaseSubjectSchema = executorCompatibilityReleaseSubjectSchema.transform(
  (value) => value as ExecutorCompatibilityReleaseSubject,
);
const typedExecutorHostScopeSchema = executorHostScopeSchema.transform(
  (value) => value as ExecutorHostScope,
);

/** 发布者证书扩展的严格运行时 Schema。 */
export const executorCompatibilityPublisherCertificateExtensionSchema = z
  .object({
    oid: z.string().regex(EXECUTOR_COMPATIBILITY_CERTIFICATE_OID_PATTERN),
    value: z
      .string()
      .min(1)
      .max(EXECUTOR_COMPATIBILITY_CERTIFICATE_EXTENSION_VALUE_MAX_LENGTH)
      .refine((value) => value === value.trim()),
  })
  .strict();

/** 发布者证书 SAN 身份的严格运行时 Schema。 */
export const executorCompatibilityPublisherCertificateIdentitySchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        kind: z.literal(ExecutorCompatibilityCertificateIdentityKind.Uri),
        value: canonicalHttpsResourceUriSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal(ExecutorCompatibilityCertificateIdentityKind.Email),
        value: exactEmailSchema,
      })
      .strict(),
  ],
);

/** 不含自身摘要的 Publisher Identity Policy Schema。 */
export const executorCompatibilityPublisherIdentityPolicyDigestInputSchema = z
  .object({
    schemaVersion: z.literal(EXECUTOR_COMPATIBILITY_PUBLISHER_IDENTITY_POLICY_SCHEMA_VERSION),
    certificateIssuer: canonicalHttpsUriSchema,
    certificateIdentity: executorCompatibilityPublisherCertificateIdentitySchema,
    certificateExtensions: z.array(executorCompatibilityPublisherCertificateExtensionSchema).min(1),
    ctLogThreshold: z
      .number()
      .int()
      .min(EXECUTOR_COMPATIBILITY_MINIMUM_CT_LOG_THRESHOLD)
      .max(EXECUTOR_COMPATIBILITY_MAXIMUM_LOG_THRESHOLD),
    tlogThreshold: z
      .number()
      .int()
      .min(EXECUTOR_COMPATIBILITY_MINIMUM_TLOG_THRESHOLD)
      .max(EXECUTOR_COMPATIBILITY_MAXIMUM_LOG_THRESHOLD),
  })
  .strict();

/** 完整 Publisher Identity Policy Schema。 */
export const executorCompatibilityPublisherIdentityPolicySchema =
  executorCompatibilityPublisherIdentityPolicyDigestInputSchema
    .extend({ identityPolicyDigest: contentDigestSchema })
    .strict();

/** 精确发布目标的严格运行时 Schema。 */
export const executorCompatibilityPublicationTargetSchema = z
  .object({
    kind: z.enum(ExecutorCompatibilityPublicationTargetKind),
    uri: canonicalHttpsResourceUriSchema,
  })
  .strict();

/** 不含自身摘要的 Release Candidate Schema。 */
export const executorCompatibilityReleaseCandidateDigestInputSchema = z
  .object({
    schemaVersion: z.literal(EXECUTOR_COMPATIBILITY_RELEASE_CANDIDATE_SCHEMA_VERSION),
    bundleDigest: contentDigestSchema,
    matrixDigest: contentDigestSchema,
    packageDigest: contentDigestSchema,
    publisherIdentityPolicyDigest: contentDigestSchema,
    target: executorCompatibilityPublicationTargetSchema,
  })
  .strict();

/** 完整 Release Candidate Schema。 */
export const executorCompatibilityReleaseCandidateSchema =
  executorCompatibilityReleaseCandidateDigestInputSchema
    .extend({ candidateDigest: contentDigestSchema })
    .strict();

/** G6 Approval Binding 的严格运行时 Schema。 */
export const executorCompatibilityG6ApprovalBindingSchema = z
  .object({
    schemaVersion: z.literal(EXECUTOR_COMPATIBILITY_G6_APPROVAL_BINDING_SCHEMA_VERSION),
    gate: z.literal(GateId.G6MergeRelease),
    decisionRequestDigest: contentDigestSchema,
    approvalRecordDigest: contentDigestSchema,
    releaseCandidateDigest: contentDigestSchema,
  })
  .strict();

/** in-toto Subject 的严格运行时 Schema。 */
export const executorCompatibilityInTotoSubjectSchema = z
  .object({
    name: z.string().min(1).max(EXECUTOR_COMPATIBILITY_ATTESTATION_URI_MAX_LENGTH),
    digest: z.object({ sha256: sha256HexSchema }).strict(),
  })
  .strict();

/** Executor Compatibility Attestation Predicate 的严格运行时 Schema。 */
export const executorCompatibilityAttestationPredicateSchema = z
  .object({
    schemaVersion: z.literal(EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_SCHEMA_VERSION),
    releaseCandidate: executorCompatibilityReleaseCandidateSchema,
    releaseSubject: typedReleaseSubjectSchema,
    executorScope: typedExecutorHostScopeSchema,
    publisherIdentityPolicy: executorCompatibilityPublisherIdentityPolicySchema,
    g6Approval: executorCompatibilityG6ApprovalBindingSchema,
  })
  .strict();

/** in-toto Statement v1 的严格运行时 Schema。 */
export const executorCompatibilityAttestationStatementSchema = z
  .object({
    _type: z.literal(IN_TOTO_STATEMENT_V1_TYPE),
    subject: z.tuple([
      executorCompatibilityInTotoSubjectSchema.extend({
        name: z.literal(EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SUBJECT_NAME),
      }),
      executorCompatibilityInTotoSubjectSchema,
    ]),
    predicateType: z.literal(EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_TYPE),
    predicate: executorCompatibilityAttestationPredicateSchema,
  })
  .strict();

function isCanonicalHttpsUri(value: string): boolean {
  try {
    const parsed = new URL(value);
    const canonicalValue =
      parsed.pathname === "/" ? parsed.origin : `${parsed.origin}${parsed.pathname}`;
    return (
      parsed.protocol === "https:" &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0 &&
      (parsed.pathname === "/" || !parsed.pathname.endsWith("/")) &&
      value === canonicalValue
    );
  } catch {
    return false;
  }
}

function hasConcreteResourcePath(value: string): boolean {
  return new URL(value).pathname !== "/";
}
