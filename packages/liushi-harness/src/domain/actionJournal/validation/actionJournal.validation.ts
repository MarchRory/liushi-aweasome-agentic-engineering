import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  actorRefSchema,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import { parseTaskId, type TaskId } from "#domain/task/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  MAX_ACTION_ERROR_CODE_LENGTH,
  MAX_ACTION_IDEMPOTENCY_KEY_LENGTH,
  MAX_ACTION_RECOVERY_GUIDANCE_LENGTH,
  MAX_ACTION_RESOLUTION_REASON_LENGTH,
  MAX_ACTION_TARGET_LENGTH,
} from "../constants/index.js";
import type {
  ActionIntentRecord,
  ActionJournalRecord,
  ActionObservationRecord,
  ActionResolutionRecord,
} from "../contracts/index.js";
import {
  ActionJournalRecordType,
  ActionJournalSchemaVersion,
  ActionKind,
  ActionOutcome,
  ActionResolution,
} from "../enums/index.js";
import { parseActionId, type ActionId } from "../identity/index.js";
import {
  parseSessionActionIntent,
  parseSessionActionObservation,
} from "./sessionActionJournal.validation.js";

const nonBlank = (maxLength: number): z.ZodString =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim())
    .refine((value) => !value.includes("\0"));

const branded = <T>(parser: (value: string) => Result<T, HarnessError>) =>
  z.string().transform((value, context): T => {
    const parsed = parser(value);
    if (parsed.status === ResultStatus.Failure) {
      context.addIssue({ code: "custom", message: parsed.error.message });
      return z.NEVER;
    }
    return parsed.value;
  });

const actionIdSchema = branded<ActionId>(parseActionId);
const workspaceIdSchema = branded<WorkspaceId>(parseWorkspaceId);
const taskIdSchema = branded<TaskId>(parseTaskId);
const digestSchema = branded<ContentDigest>(parseContentDigest);

const recordBase = {
  schemaVersion: z.literal(ACTION_JOURNAL_SCHEMA_VERSION),
  actionId: actionIdSchema,
  workspaceId: workspaceIdSchema,
  taskId: taskIdSchema,
  sequence: z.number().int().positive(),
  actor: actorRefSchema,
  recordedAt: z.string().datetime({ offset: true }),
};

const intentSchema = z
  .object({
    ...recordBase,
    recordType: z.literal(ActionJournalRecordType.Intent),
    sequence: z.literal(1),
    commandId: nonBlank(128),
    correlationId: nonBlank(128),
    causationId: nonBlank(128).optional(),
    idempotencyKey: nonBlank(MAX_ACTION_IDEMPOTENCY_KEY_LENGTH),
    kind: z.enum(ActionKind),
    target: nonBlank(MAX_ACTION_TARGET_LENGTH),
    inputDigest: digestSchema,
    postconditionDigest: digestSchema,
    baseRevision: nonBlank(512).optional(),
    recoveryGuidance: nonBlank(MAX_ACTION_RECOVERY_GUIDANCE_LENGTH),
  })
  .strict();

const observationSchema = z
  .object({
    ...recordBase,
    recordType: z.literal(ActionJournalRecordType.Observation),
    sequence: z.number().int().positive(),
    outcome: z.enum(ActionOutcome),
    evidenceIds: z.array(nonBlank(256)).superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: "Evidence ID 不能重复。" });
      }
    }),
    outputDigest: digestSchema.optional(),
    errorCode: nonBlank(MAX_ACTION_ERROR_CODE_LENGTH).optional(),
  })
  .strict()
  .superRefine((record, context) => {
    if (
      [ActionOutcome.Failed, ActionOutcome.OutcomeUnknown].includes(record.outcome) &&
      record.errorCode === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "失败或未知结果必须提供稳定错误码。",
        path: ["errorCode"],
      });
    }
  });

const resolutionSchema = z
  .object({
    ...recordBase,
    recordType: z.literal(ActionJournalRecordType.Resolution),
    resolution: z.enum(ActionResolution),
    reason: nonBlank(MAX_ACTION_RESOLUTION_REASON_LENGTH),
  })
  .strict();

const recordTypeSchema = z.object({ recordType: z.enum(ActionJournalRecordType) }).passthrough();
const schemaVersionSchema = z
  .object({ schemaVersion: z.enum(ActionJournalSchemaVersion) })
  .passthrough();

/** 根据封闭 recordType 与 schemaVersion 严格解析任意 Action Journal record。 */
export function parseActionJournalRecord(
  input: unknown,
): Result<ActionJournalRecord, HarnessError> {
  const recordType = recordTypeSchema.safeParse(input);
  if (!recordType.success)
    return invalidRecord(recordType.error, "Action Journal record 类型无效。");
  switch (recordType.data.recordType) {
    case ActionJournalRecordType.Intent:
      return parseActionIntent(input);
    case ActionJournalRecordType.Observation:
      return parseActionObservation(input);
    case ActionJournalRecordType.Resolution:
      return parseActionResolution(input);
  }
}

/** 严格解析 legacy 或 Session Action Intent record。 */
export function parseActionIntent(input: unknown): Result<ActionIntentRecord, HarnessError> {
  const version = schemaVersionSchema.safeParse(input);
  if (!version.success) return invalidRecord(version.error, "Action Intent Schema 版本无效。");
  return version.data.schemaVersion === ActionJournalSchemaVersion.Session
    ? parseSessionActionIntent(input)
    : parseLegacyActionIntent(input);
}

/** 严格解析 legacy 或 Session Action Observation record。 */
export function parseActionObservation(
  input: unknown,
): Result<ActionObservationRecord, HarnessError> {
  const version = schemaVersionSchema.safeParse(input);
  if (!version.success) return invalidRecord(version.error, "Action Observation Schema 版本无效。");
  return version.data.schemaVersion === ActionJournalSchemaVersion.Session
    ? parseSessionActionObservation(input)
    : parseLegacyActionObservation(input);
}

/** 严格解析 Action Resolution record。 */
export function parseActionResolution(
  input: unknown,
): Result<ActionResolutionRecord, HarnessError> {
  const parsed = resolutionSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data)
    : invalidRecord(parsed.error, "Action Resolution 无效。");
}

function parseLegacyActionIntent(input: unknown): Result<ActionIntentRecord, HarnessError> {
  const parsed = intentSchema.safeParse(input);
  if (!parsed.success) return invalidRecord(parsed.error, "Legacy Action Intent 无效。");
  const { causationId, baseRevision, ...record } = parsed.data;
  return success({
    ...record,
    ...(causationId === undefined ? {} : { causationId }),
    ...(baseRevision === undefined ? {} : { baseRevision }),
  });
}

function parseLegacyActionObservation(
  input: unknown,
): Result<ActionObservationRecord, HarnessError> {
  const parsed = observationSchema.safeParse(input);
  if (!parsed.success) return invalidRecord(parsed.error, "Legacy Action Observation 无效。");
  const { outputDigest, errorCode, ...record } = parsed.data;
  return success({
    ...record,
    ...(outputDigest === undefined ? {} : { outputDigest }),
    ...(errorCode === undefined ? {} : { errorCode }),
  });
}

function invalidRecord<T>(error: z.ZodError, message: string): Result<T, HarnessError> {
  const issue = error.issues[0];
  return failure(
    new HarnessError(
      HarnessErrorCode.InvalidInput,
      message,
      { path: issue?.path.join(".") ?? "unknown", issue: issue?.message ?? "unknown" },
      error,
    ),
  );
}
