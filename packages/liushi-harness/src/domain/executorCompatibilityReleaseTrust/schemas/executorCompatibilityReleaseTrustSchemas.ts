import { z } from "zod";
import { CONTENT_DIGEST_PATTERN, type ContentDigest } from "#common/index.js";
import { executorCompatibilityReleaseSubjectSchema } from "#domain/executorCompatibilityPublication/index.js";
import {
  executorCompatibilityPublisherCertificateExtensionSchema,
  executorCompatibilityPublisherCertificateIdentitySchema,
  executorCompatibilityPublisherIdentityPolicyDigestInputSchema,
  executorCompatibilityPublicationTargetSchema,
} from "#domain/executorCompatibilityAttestation/index.js";
import { ExecutorSupportLevel } from "#domain/executorCompatibility/index.js";

import {
  EXECUTOR_COMPATIBILITY_PUBLISHER_TRUST_POLICY_RUNNER_ENVIRONMENT_MAX_LENGTH,
  EXECUTOR_COMPATIBILITY_PUBLISHER_TRUST_POLICY_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_ID_MAX_LENGTH,
  EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_ID_MIN_LENGTH,
  EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_ID_PATTERN,
  EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_SCHEMA_VERSION,
} from "../constants/index.js";

const contentDigestSchema = z
  .string()
  .regex(CONTENT_DIGEST_PATTERN)
  .transform((value) => value as ContentDigest);
const publisherIdentityPartsSchema = executorCompatibilityPublisherIdentityPolicyDigestInputSchema;
const profilePackageAndRepositorySchema = executorCompatibilityReleaseSubjectSchema
  .pick({ packageName: true, repositoryUri: true })
  .strict();

/** 稳定 Publisher Trust Policy 的运行时 Schema。 */
export const executorCompatibilityPublisherTrustPolicyDigestInputSchema = z
  .object({
    schemaVersion: z.literal(EXECUTOR_COMPATIBILITY_PUBLISHER_TRUST_POLICY_SCHEMA_VERSION),
    certificateIssuer: publisherIdentityPartsSchema.shape.certificateIssuer,
    certificateIdentity: executorCompatibilityPublisherCertificateIdentitySchema,
    runnerEnvironment: executorCompatibilityPublisherCertificateExtensionSchema.shape.value.max(
      EXECUTOR_COMPATIBILITY_PUBLISHER_TRUST_POLICY_RUNNER_ENVIRONMENT_MAX_LENGTH,
    ),
    ctLogThreshold: publisherIdentityPartsSchema.shape.ctLogThreshold,
    tlogThreshold: publisherIdentityPartsSchema.shape.tlogThreshold,
    additionalCertificateExtensions: z.array(
      executorCompatibilityPublisherCertificateExtensionSchema,
    ),
  })
  .strict();

/** 完整 Publisher Trust Policy 的运行时 Schema。 */
export const executorCompatibilityPublisherTrustPolicySchema =
  executorCompatibilityPublisherTrustPolicyDigestInputSchema
    .extend({ publisherTrustPolicyDigest: contentDigestSchema })
    .strict();

/** Trust Profile 中排除自身摘要的运行时 Schema。 */
export const executorCompatibilityReleaseTrustProfileDigestInputSchema = z
  .object({
    schemaVersion: z.literal(EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_SCHEMA_VERSION),
    profileId: z
      .string()
      .min(EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_ID_MIN_LENGTH)
      .max(EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_ID_MAX_LENGTH)
      .regex(EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_ID_PATTERN),
    ...profilePackageAndRepositorySchema.shape,
    target: executorCompatibilityPublicationTargetSchema,
    publisherTrustPolicy: executorCompatibilityPublisherTrustPolicySchema,
    trustedRootDigest: contentDigestSchema,
    minimumSupportLevel: z.enum([
      ExecutorSupportLevel.Production,
      ExecutorSupportLevel.Compatible,
      ExecutorSupportLevel.Experimental,
    ]),
    bootstrapManifestDigest: contentDigestSchema,
  })
  .strict();

/** 完整 Trust Profile 的运行时 Schema。 */
export const executorCompatibilityReleaseTrustProfileSchema =
  executorCompatibilityReleaseTrustProfileDigestInputSchema
    .extend({ profileDigest: contentDigestSchema })
    .strict();
