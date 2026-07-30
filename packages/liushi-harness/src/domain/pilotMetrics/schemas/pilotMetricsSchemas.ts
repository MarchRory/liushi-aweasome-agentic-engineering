import { z } from "zod";

import {
  ActorKind,
  ResultStatus,
  parseContentDigest,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "#common/index.js";
import { actorRefSchema } from "#common/types/index.js";
import { parseActionId } from "#domain/actionJournal/index.js";
import { parseCodingTaskId } from "#domain/codingTask/index.js";
import { parseCodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";

import {
  PilotAttestation,
  PilotEnrollmentSchemaVersion,
  PilotExecutionMode,
  PilotHumanTouchCategory,
  PilotHumanTouchSource,
  PilotQualityFactKind,
  PilotRiskLevel,
  PilotSettlementSchemaVersion,
  PilotStepOutcome,
  PilotStepPhase,
  PilotTaskClass,
} from "../enums/index.js";
import {
  isIsoUtc,
  validateEnrollment,
  validateSettlement,
} from "./pilotMetricsRecordValidation.js";

const safeId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const revision = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value === value.trim() && !value.includes("\0"));
const isoUtc = z.string().refine(isIsoUtc, "时间必须是带毫秒的规范 UTC ISO 字符串");
const digest = z.string().transform((value, context): ContentDigest => {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: "Content Digest 无效" });
    return z.NEVER;
  }
  return parsed.value;
});
const parsed = <T>(parser: (value: string) => Result<T, HarnessError>) =>
  z.string().transform((value, context): T => {
    const result = parser(value);
    if (result.status === ResultStatus.Failure) {
      context.addIssue({ code: "custom", message: "标识无效" });
      return z.NEVER;
    }
    return result.value;
  });
const humanActor = actorRefSchema.refine(
  (actor) =>
    actor.kind === ActorKind.Human &&
    actor.actorId.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(actor.actorId),
  "Pilot Metrics 记录必须由 Human 使用已脱敏 opaque actorId 提交",
);

const plannedStepSchema = z
  .object({
    stepId: safeId,
    phase: z.nativeEnum(PilotStepPhase),
    required: z.boolean(),
    expectedExecutionMode: z.nativeEnum(PilotExecutionMode),
  })
  .strict();
const humanTouchEntrySchema = z
  .object({
    entryId: safeId,
    category: z.nativeEnum(PilotHumanTouchCategory),
    source: z.nativeEnum(PilotHumanTouchSource),
    startedAt: isoUtc,
    completedAt: isoUtc,
    durationMs: z.number().int().nonnegative().safe(),
  })
  .strict();
const stepFactSchema = z
  .object({
    stepId: safeId,
    actualExecutionMode: z.nativeEnum(PilotExecutionMode),
    outcome: z.nativeEnum(PilotStepOutcome),
    attemptCount: z.number().int().positive().safe(),
    evidenceDigests: z.array(digest),
  })
  .strict();
const qualityFactSchema = z
  .object({
    factId: safeId,
    kind: z.nativeEnum(PilotQualityFactKind),
    stepId: safeId.optional(),
    evidenceDigest: digest,
  })
  .strict();

const enrollmentFields = {
  pilotId: safeId,
  workspaceId: parsed(parseWorkspaceId),
  sessionId: parsed(parseCodingTaskSessionId),
  codingTaskId: parsed(parseCodingTaskId),
  repositoryId: parsed(parseRepositoryId),
  taskClass: z.nativeEnum(PilotTaskClass),
  riskLevel: z.nativeEnum(PilotRiskLevel),
  historicalLogicChange: z.boolean(),
  plannedWritePathCount: z.number().int().nonnegative().safe(),
  requiredValidatorCount: z.number().int().nonnegative().safe(),
  repositoryRevision: revision,
  harnessRevision: revision,
  policyDigest: digest,
  plannedSteps: z.array(plannedStepSchema),
  enrolledAt: isoUtc,
  actor: humanActor,
} as const;

export const enrollmentInputSchema = z
  .object(enrollmentFields)
  .strict()
  .superRefine(validateEnrollment);
export const enrollmentSchema = z
  .object({
    ...enrollmentFields,
    schemaVersion: z.literal(PilotEnrollmentSchemaVersion.V1),
    recordDigest: digest,
  })
  .strict()
  .superRefine(validateEnrollment);

const settlementFields = {
  pilotId: safeId,
  workspaceId: parsed(parseWorkspaceId),
  sessionId: parsed(parseCodingTaskSessionId),
  codingTaskId: parsed(parseCodingTaskId),
  repositoryId: parsed(parseRepositoryId),
  enrollmentDigest: digest,
  verificationRunId: safeId,
  verificationActionId: parsed(parseActionId),
  humanTouchEntries: z.array(humanTouchEntrySchema),
  stepFacts: z.array(stepFactSchema),
  qualityFacts: z.array(qualityFactSchema),
  attestation: z.nativeEnum(PilotAttestation),
  settledAt: isoUtc,
  actor: humanActor,
} as const;

export const settlementInputSchema = z
  .object(settlementFields)
  .strict()
  .superRefine(validateSettlement);
export const settlementSchema = z
  .object({
    ...settlementFields,
    schemaVersion: z.literal(PilotSettlementSchemaVersion.V1),
    recordDigest: digest,
  })
  .strict()
  .superRefine(validateSettlement);
