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
import { parseCodingTaskId, type CodingTaskId } from "#domain/codingTask/index.js";
import {
  parseCodingTaskSessionId,
  type CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import { parseTaskId, type TaskId } from "#domain/task/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

import {
  MAX_ACTION_ERROR_CODE_LENGTH,
  MAX_ACTION_IDEMPOTENCY_KEY_LENGTH,
  MAX_ACTION_RECOVERY_GUIDANCE_LENGTH,
  MAX_ACTION_TARGET_LENGTH,
  MAX_SESSION_ACTION_RECOVERY_PATH_DIGESTS,
  MAX_SESSION_ACTION_TARGETS,
  SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
} from "../constants/index.js";
import type {
  SessionActionIntentRecord,
  SessionActionObservationRecord,
} from "../contracts/index.js";
import {
  ActionJournalRecordType,
  ActionKind,
  ActionOutcome,
  SessionActionTraceDisposition,
  SessionActionTraceDropReason,
} from "../enums/index.js";
import { parseActionId, type ActionId } from "../identity/index.js";

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
const sessionIdSchema = branded<CodingTaskSessionId>(parseCodingTaskSessionId);
const codingTaskIdSchema = branded<CodingTaskId>(parseCodingTaskId);
const digestSchema = branded<ContentDigest>(parseContentDigest);

const sessionProvenanceSchema = z
  .object({
    sessionId: sessionIdSchema,
    codingTaskId: codingTaskIdSchema,
    attemptNumber: z.number().int().positive().safe(),
    worktreeId: nonBlank(256),
    worktreeRootDigest: digestSchema,
    activationBindingDigest: digestSchema,
    sessionBindingDigest: digestSchema,
    executorSessionIdDigest: digestSchema,
  })
  .strict();

const targetsSchema = z
  .array(nonBlank(MAX_ACTION_TARGET_LENGTH))
  .min(1)
  .max(MAX_SESSION_ACTION_TARGETS)
  .superRefine((targets, context) => {
    if (new Set(targets).size !== targets.length) {
      context.addIssue({ code: "custom", message: "Session targets 不能重复。" });
    }
    const sorted = [...targets].sort();
    if (sorted.some((target, index) => target !== targets[index])) {
      context.addIssue({ code: "custom", message: "Session targets 必须按字典序排序。" });
    }
    targets.forEach((target, index) => {
      if (!isRepositoryRelativeTarget(target)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Session target 必须是规范化的仓库相对路径。",
        });
      }
    });
  });

const recoveryPathDigestsSchema = z
  .array(digestSchema)
  .max(MAX_SESSION_ACTION_RECOVERY_PATH_DIGESTS)
  .superRefine((digests, context) => {
    if (new Set(digests).size !== digests.length) {
      context.addIssue({ code: "custom", message: "Recovery path digest 不能重复。" });
    }
    const sorted = [...digests].sort();
    if (sorted.some((digest, index) => digest !== digests[index])) {
      context.addIssue({ code: "custom", message: "Recovery path digest 必须排序。" });
    }
  });

const traceSchema = z
  .object({
    observationDigest: digestSchema.optional(),
    disposition: z.enum(SessionActionTraceDisposition),
    dropReason: z.enum(SessionActionTraceDropReason).optional(),
    recoveryPathDigests: recoveryPathDigestsSchema,
  })
  .strict()
  .superRefine((trace, context) => {
    if (
      trace.disposition === SessionActionTraceDisposition.Persisted &&
      trace.dropReason !== undefined
    ) {
      context.addIssue({ code: "custom", message: "已持久化 Trace 不得提供丢弃原因。" });
    }
    if (
      trace.disposition === SessionActionTraceDisposition.Dropped &&
      trace.dropReason === undefined
    ) {
      context.addIssue({ code: "custom", message: "被丢弃 Trace 必须提供丢弃原因。" });
    }
  });

const base = {
  schemaVersion: z.literal(SESSION_ACTION_JOURNAL_SCHEMA_VERSION),
  actionId: actionIdSchema,
  workspaceId: workspaceIdSchema,
  taskId: taskIdSchema,
  sequence: z.number().int().positive(),
  actor: actorRefSchema,
  recordedAt: z.string().datetime({ offset: true }),
};

const intentSchema = z
  .object({
    ...base,
    recordType: z.literal(ActionJournalRecordType.Intent),
    sequence: z.literal(1),
    commandId: nonBlank(128),
    correlationId: nonBlank(128),
    causationId: nonBlank(128).optional(),
    idempotencyKey: nonBlank(MAX_ACTION_IDEMPOTENCY_KEY_LENGTH),
    kind: z.enum(ActionKind),
    target: nonBlank(MAX_ACTION_TARGET_LENGTH),
    targets: targetsSchema,
    inputDigest: digestSchema,
    postconditionDigest: digestSchema,
    baseRevision: nonBlank(512).optional(),
    recoveryGuidance: nonBlank(MAX_ACTION_RECOVERY_GUIDANCE_LENGTH),
    sessionProvenance: sessionProvenanceSchema,
  })
  .strict();

const observationSchema = z
  .object({
    ...base,
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
    sessionProvenance: sessionProvenanceSchema,
    targets: targetsSchema,
    trace: traceSchema,
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

/** 严格解析 Session Action Intent record。 */
export function parseSessionActionIntent(
  input: unknown,
): Result<SessionActionIntentRecord, HarnessError> {
  const parsed = intentSchema.safeParse(input);
  if (!parsed.success) return invalidRecord(parsed.error, "Session Action Intent 无效。");
  const { causationId, baseRevision, ...record } = parsed.data;
  return success({
    ...record,
    ...(causationId === undefined ? {} : { causationId }),
    ...(baseRevision === undefined ? {} : { baseRevision }),
  });
}

/** 严格解析 Session Action Observation record。 */
export function parseSessionActionObservation(
  input: unknown,
): Result<SessionActionObservationRecord, HarnessError> {
  const parsed = observationSchema.safeParse(input);
  if (!parsed.success) return invalidRecord(parsed.error, "Session Action Observation 无效。");
  const { outputDigest, errorCode, trace, ...record } = parsed.data;
  const { observationDigest, dropReason, ...traceRecord } = trace;
  return success({
    ...record,
    ...(outputDigest === undefined ? {} : { outputDigest }),
    ...(errorCode === undefined ? {} : { errorCode }),
    trace: {
      ...traceRecord,
      ...(observationDigest === undefined ? {} : { observationDigest }),
      ...(dropReason === undefined ? {} : { dropReason }),
    },
  });
}

function isRepositoryRelativeTarget(value: string): boolean {
  if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) {
    return false;
  }
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
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
