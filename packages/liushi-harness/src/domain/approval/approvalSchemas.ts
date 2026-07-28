import { z } from "zod";

import {
  APPROVAL_RECORD_SCHEMA_VERSION,
  DECISION_REQUEST_SCHEMA_VERSION,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  actorRefSchema,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ARTIFACT_ID_PATTERN,
  parseArtifactDigest,
  type ArtifactDigest,
  type ArtifactId,
} from "#domain/artifact/index.js";
import { GateId, RiskLevel } from "#domain/policy/index.js";
import { TaskPhase, parseTaskId } from "#domain/task/index.js";

import {
  MAX_APPROVAL_IDEMPOTENCY_KEY_LENGTH,
  MAX_APPROVAL_REASON_LENGTH,
  MAX_DECISION_ACTION_LENGTH,
  MAX_RESUME_CHECKPOINT_LENGTH,
} from "./approvalConstants.js";
import type { ApprovalRecord, DecisionRequest } from "./approvalContracts.js";
import { ApprovalDecision } from "./approvalEnums.js";
import {
  APPROVAL_ULID_PATTERN,
  type ApprovalId,
  type DecisionRequestId,
} from "./identifiers/index.js";

const nonBlank = (maxLength: number): z.ZodString =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim());
const artifactDigestSchema = z
  .string()
  .refine((value) => parseArtifactDigest(value).status === ResultStatus.Success)
  .transform((value) => value as ArtifactDigest);
const artifactIdSchema = z
  .string()
  .regex(ARTIFACT_ID_PATTERN)
  .transform((value) => value as ArtifactId);
const approvalIdSchema = z
  .string()
  .regex(APPROVAL_ULID_PATTERN)
  .transform((value) => value as ApprovalId);
const decisionRequestIdSchema = z
  .string()
  .regex(APPROVAL_ULID_PATTERN)
  .transform((value) => value as DecisionRequestId);
const taskIdSchema = z.string().transform((value, context) => {
  const parsed = parseTaskId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

/** DecisionRequest 的严格 Zod Schema。 */
export const decisionRequestSchema = z
  .object({
    schemaVersion: z.literal(DECISION_REQUEST_SCHEMA_VERSION),
    decisionRequestId: decisionRequestIdSchema,
    taskId: taskIdSchema,
    gate: z.enum(GateId),
    artifactId: artifactIdSchema,
    artifactDigest: artifactDigestSchema,
    riskLevel: z.enum(RiskLevel),
    resumePhase: z.enum(TaskPhase),
    resumeCheckpoint: nonBlank(MAX_RESUME_CHECKPOINT_LENGTH),
    requiredAction: nonBlank(MAX_DECISION_ACTION_LENGTH),
    writeSetDigest: artifactDigestSchema.optional(),
    baseRevision: nonBlank(MAX_DECISION_ACTION_LENGTH).optional(),
    digest: artifactDigestSchema,
    createdAt: z.string().datetime(),
    createdBy: actorRefSchema,
  })
  .strict();

/** ApprovalRecord 的严格 Zod Schema。 */
export const approvalRecordSchema = z
  .object({
    schemaVersion: z.literal(APPROVAL_RECORD_SCHEMA_VERSION),
    approvalId: approvalIdSchema,
    decisionRequestId: decisionRequestIdSchema,
    decisionRequestDigest: artifactDigestSchema,
    gate: z.enum(GateId),
    artifactId: artifactIdSchema,
    artifactDigest: artifactDigestSchema,
    idempotencyKey: nonBlank(MAX_APPROVAL_IDEMPOTENCY_KEY_LENGTH),
    actor: actorRefSchema,
    decision: z.enum(ApprovalDecision),
    reason: nonBlank(MAX_APPROVAL_REASON_LENGTH).optional(),
    createdAt: z.string().datetime(),
    digest: artifactDigestSchema,
  })
  .strict()
  .superRefine((approval, context) => {
    if (approval.decision !== ApprovalDecision.Approved && approval.reason === undefined) {
      context.addIssue({
        code: "custom",
        message: "Rejected or waived approval requires a reason.",
        path: ["reason"],
      });
    }
  });

/** 校验未知输入并返回 DecisionRequest。 */
export function parseDecisionRequest(input: unknown): Result<DecisionRequest, HarnessError> {
  const parsed = decisionRequestSchema.safeParse(input);
  return parsed.success
    ? success(mapDecisionRequest(parsed.data))
    : failure(createApprovalSchemaError(parsed.error, "Decision request schema is invalid."));
}

/** 校验未知输入并返回 ApprovalRecord。 */
export function parseApprovalRecord(input: unknown): Result<ApprovalRecord, HarnessError> {
  const parsed = approvalRecordSchema.safeParse(input);
  return parsed.success
    ? success(mapApprovalRecord(parsed.data))
    : failure(createApprovalSchemaError(parsed.error, "Approval record schema is invalid."));
}

function mapDecisionRequest(input: z.infer<typeof decisionRequestSchema>): DecisionRequest {
  return {
    schemaVersion: input.schemaVersion,
    decisionRequestId: input.decisionRequestId,
    taskId: input.taskId,
    gate: input.gate,
    artifactId: input.artifactId,
    artifactDigest: input.artifactDigest,
    riskLevel: input.riskLevel,
    resumePhase: input.resumePhase,
    resumeCheckpoint: input.resumeCheckpoint,
    requiredAction: input.requiredAction,
    ...(input.writeSetDigest === undefined ? {} : { writeSetDigest: input.writeSetDigest }),
    ...(input.baseRevision === undefined ? {} : { baseRevision: input.baseRevision }),
    digest: input.digest,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  };
}

function mapApprovalRecord(input: z.infer<typeof approvalRecordSchema>): ApprovalRecord {
  return {
    schemaVersion: input.schemaVersion,
    approvalId: input.approvalId,
    decisionRequestId: input.decisionRequestId,
    decisionRequestDigest: input.decisionRequestDigest,
    gate: input.gate,
    artifactId: input.artifactId,
    artifactDigest: input.artifactDigest,
    idempotencyKey: input.idempotencyKey,
    actor: input.actor,
    decision: input.decision,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    createdAt: input.createdAt,
    digest: input.digest,
  };
}

function createApprovalSchemaError(error: z.ZodError, message: string): HarnessError {
  const issue = error.issues[0];
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    message,
    {
      path: issue?.path.join(".") ?? "unknown",
      issue: issue?.message ?? "unknown",
    },
    error,
  );
}
