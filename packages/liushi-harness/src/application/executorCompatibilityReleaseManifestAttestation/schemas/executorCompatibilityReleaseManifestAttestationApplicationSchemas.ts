import { z } from "zod";

import { executorCompatibilitySigstoreBundleJsonSchema } from "#application/executorCompatibilityAttestation/index.js";
import { CONTENT_DIGEST_PATTERN, type ContentDigest } from "#common/index.js";
import { executorCompatibilityReleaseManifestAttestationDraftSchema } from "#domain/executorCompatibilityReleaseManifestAttestation/index.js";

import { EXECUTOR_COMPATIBILITY_SIGNED_RELEASE_MANIFEST_ARTIFACT_SCHEMA_VERSION } from "../constants/index.js";
import type {
  ExecutorCompatibilitySignedReleaseManifestArtifact,
  ExecutorCompatibilitySignedReleaseManifestArtifactDigestInput,
} from "../contracts/index.js";

const contentDigestSchema = z
  .string()
  .regex(CONTENT_DIGEST_PATTERN)
  .transform((value) => value as ContentDigest);

const signedReleaseManifestArtifactDigestInputObjectSchema = z
  .object({
    schemaVersion: z.literal(
      EXECUTOR_COMPATIBILITY_SIGNED_RELEASE_MANIFEST_ARTIFACT_SCHEMA_VERSION,
    ),
    draft: executorCompatibilityReleaseManifestAttestationDraftSchema,
    statementDigest: contentDigestSchema,
    sigstoreBundle: executorCompatibilitySigstoreBundleJsonSchema,
    sigstoreBundleDigest: contentDigestSchema,
  })
  .strict();

/** 不含自身摘要的 Signed Manifest Artifact Schema。 */
export const executorCompatibilitySignedReleaseManifestArtifactDigestInputSchema =
  signedReleaseManifestArtifactDigestInputObjectSchema.transform(
    (value) => value as ExecutorCompatibilitySignedReleaseManifestArtifactDigestInput,
  );

/** 完整 Signed Manifest Artifact Schema。 */
export const executorCompatibilitySignedReleaseManifestArtifactSchema =
  signedReleaseManifestArtifactDigestInputObjectSchema
    .extend({ artifactDigest: contentDigestSchema })
    .strict()
    .transform((value) => value as ExecutorCompatibilitySignedReleaseManifestArtifact);
