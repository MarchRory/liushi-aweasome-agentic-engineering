import { z } from "zod";

import { CONTENT_DIGEST_PATTERN, type ContentDigest } from "#common/index.js";
import { decisionRequestSchema, approvalRecordSchema } from "#domain/approval/index.js";
import { ExecutorCompatibilityReleaseApprovalSubject } from "#domain/executorCompatibilityAttestation/index.js";

import {
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_EVIDENCE_ID_MAX_LENGTH,
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_EVIDENCE_ID_PATTERN,
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_ID_MAX_LENGTH,
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_ID_MIN_LENGTH,
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_ID_PATTERN,
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_VERIFICATION_RECEIPT_SCHEMA_VERSION,
} from "../constants/index.js";

const contentDigestSchema = z
  .string()
  .regex(CONTENT_DIGEST_PATTERN)
  .transform((value) => value as ContentDigest);
/** Authority 标识的严格 Schema。 */
export const executorCompatibilityReleaseApprovalAuthorityIdSchema = z
  .string()
  .min(EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_ID_MIN_LENGTH)
  .max(EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_ID_MAX_LENGTH)
  .regex(EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_ID_PATTERN);
const authorityEvidenceIdSchema = z
  .string()
  .min(EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_ID_MIN_LENGTH)
  .max(EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_EVIDENCE_ID_MAX_LENGTH)
  .regex(EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_AUTHORITY_EVIDENCE_ID_PATTERN);

/** Authority 查询输入的严格 Schema。 */
export const executorCompatibilityReleaseApprovalAuthorityInputSchema = z
  .object({
    approvalSubject: z.enum(ExecutorCompatibilityReleaseApprovalSubject),
    artifactDigest: contentDigestSchema,
  })
  .strict();

/** 权威审批验证回执的严格 Schema。 */
export const executorCompatibilityReleaseApprovalVerificationReceiptSchema = z
  .object({
    schemaVersion: z.literal(
      EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_VERIFICATION_RECEIPT_SCHEMA_VERSION,
    ),
    authorityId: executorCompatibilityReleaseApprovalAuthorityIdSchema,
    authorityEvidenceId: authorityEvidenceIdSchema,
    authorityEvidenceDigest: contentDigestSchema,
    approvalSubject: z.enum(ExecutorCompatibilityReleaseApprovalSubject),
    artifactDigest: contentDigestSchema,
    decisionRequestDigest: contentDigestSchema,
    approvalRecordDigest: contentDigestSchema,
    decisionRequest: decisionRequestSchema,
    approvalRecord: approvalRecordSchema,
    receiptDigest: contentDigestSchema,
  })
  .strict();
