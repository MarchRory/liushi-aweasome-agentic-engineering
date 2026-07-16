import { z } from "zod";

import {
  executorCapabilityEvidenceSchema,
  executorCompatibilityMatrixSchema,
  executorCompatibilityPolicySchema,
} from "#domain/executorCompatibility/index.js";

import {
  EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_NAME_MAX_LENGTH,
  EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_NAME_PATTERN,
  EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_VERSION_MAX_LENGTH,
  EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_VERSION_PATTERN,
  EXECUTOR_COMPATIBILITY_PUBLICATION_REPOSITORY_URI_MAX_LENGTH,
  EXECUTOR_COMPATIBILITY_PUBLICATION_SOURCE_REVISION_PATTERN,
} from "../constants/index.js";

const contentDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

/** npm 发布物与源码来源的运行时 Schema。 */
export const executorCompatibilityReleaseSubjectSchema = z
  .object({
    packageName: z
      .string()
      .min(1)
      .max(EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_NAME_MAX_LENGTH)
      .regex(EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_NAME_PATTERN),
    packageVersion: z
      .string()
      .min(1)
      .max(EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_VERSION_MAX_LENGTH)
      .regex(EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_VERSION_PATTERN),
    packageDigest: contentDigestSchema,
    repositoryUri: z
      .string()
      .url()
      .max(EXECUTOR_COMPATIBILITY_PUBLICATION_REPOSITORY_URI_MAX_LENGTH)
      .refine(isCanonicalRepositoryUri),
    sourceRevision: z.string().regex(EXECUTOR_COMPATIBILITY_PUBLICATION_SOURCE_REVISION_PATTERN),
  })
  .strict();

/** Publication Bundle 脱敏来源投影的运行时 Schema。 */
export const executorCompatibilityPublishedProjectionSchema = z
  .object({
    artifact: z.record(z.string(), z.unknown()),
    artifactDigest: contentDigestSchema,
    evidence: z.array(executorCapabilityEvidenceSchema).min(1),
  })
  .strict();

/** 不含自身摘要的 Publication Bundle 候选 Schema。 */
export const executorCompatibilityPublicationBundleDigestInputSchema = z
  .object({
    schemaVersion: z.literal(EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SCHEMA_VERSION),
    releaseSubject: executorCompatibilityReleaseSubjectSchema,
    matrix: executorCompatibilityMatrixSchema,
    policy: executorCompatibilityPolicySchema,
    projections: z.array(executorCompatibilityPublishedProjectionSchema).min(1),
  })
  .strict();

/** 完整 Executor Compatibility Publication Bundle 的运行时 Schema。 */
export const executorCompatibilityPublicationBundleSchema =
  executorCompatibilityPublicationBundleDigestInputSchema
    .extend({ bundleDigest: contentDigestSchema })
    .strict();

function isCanonicalRepositoryUri(value: string): boolean {
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
