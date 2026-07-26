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
import {
  ActionKind,
  ActionOutcome,
  parseActionId,
  type ActionId,
} from "#domain/actionJournal/index.js";
import {
  parseArtifactDigest,
  parseArtifactId,
  type ArtifactDigest,
  type ArtifactId,
} from "#domain/artifact/index.js";
import { parseCodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import { parseTaskId, type TaskId } from "#domain/task/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

import { parseSpanId, parseTraceId, type SpanId, type TraceId } from "../../observability/index.js";
import {
  CANONICAL_HOOK_SCHEMA_VERSION,
  CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
  MAX_HOOK_EXECUTION_ID_LENGTH,
  MAX_HOOK_EXECUTOR_ID_LENGTH,
  MAX_HOOK_TARGETS_SERIALIZED_LENGTH,
} from "../constants/index.js";
import type {
  ActionHookPayload,
  PostActionHookPayload,
  PreActionHookPayload,
} from "../contracts/index.js";
import { HarnessHookEvent, HookExecutorKind } from "../enums/index.js";
import {
  invalidHookPayload,
  isRepositoryRelativePath,
  readHookSchemaVersion,
} from "./hookValidationUtils.js";

const nonBlank = (maxLength: number): z.ZodString =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim())
    .refine((value) => !value.includes("\0"));

const brandedString = <T>(parser: (value: string) => Result<T, HarnessError>) =>
  z.string().transform((value, context): T => {
    const parsed = parser(value);
    if (parsed.status === ResultStatus.Failure) {
      context.addIssue({ code: "custom", message: parsed.error.message });
      return z.NEVER;
    }
    return parsed.value;
  });

const workspaceIdSchema = brandedString<WorkspaceId>(parseWorkspaceId);
const taskIdSchema = brandedString<TaskId>(parseTaskId);
const actionIdSchema = brandedString<ActionId>(parseActionId);
const artifactIdSchema = brandedString<ArtifactId>(parseArtifactId);
const artifactDigestSchema = brandedString<ArtifactDigest>(parseArtifactDigest);
const contentDigestSchema = brandedString<ContentDigest>(parseContentDigest);
const traceIdSchema = brandedString<TraceId>(parseTraceId);
const spanIdSchema = brandedString<SpanId>(parseSpanId);

const sharedBase = {
  hookExecutionId: nonBlank(MAX_HOOK_EXECUTION_ID_LENGTH),
  executor: z.enum(HookExecutorKind),
  sessionId: nonBlank(MAX_HOOK_EXECUTOR_ID_LENGTH),
  turnId: nonBlank(MAX_HOOK_EXECUTOR_ID_LENGTH),
  workspaceId: workspaceIdSchema,
  taskId: taskIdSchema,
  actionId: actionIdSchema,
  actor: actorRefSchema,
  commandId: nonBlank(128),
  correlationId: nonBlank(128),
  causationId: nonBlank(128).optional(),
  occurredAt: z.string().datetime({ offset: true }),
};

const sessionContextSchema = z
  .object({
    sessionId: brandedString(parseCodingTaskSessionId),
    sessionBindingDigest: contentDigestSchema,
  })
  .strict();

const targetsSchema = z
  .array(nonBlank(512))
  .min(1)
  .superRefine((targets, context) => {
    if (new Set(targets).size !== targets.length) {
      context.addIssue({ code: "custom", message: "Hook targets 不能重复。" });
    }
    if ([...targets].sort().some((target, index) => target !== targets[index])) {
      context.addIssue({ code: "custom", message: "Hook targets 必须按字典序稳定排序。" });
    }
    if (JSON.stringify(targets).length > MAX_HOOK_TARGETS_SERIALIZED_LENGTH) {
      context.addIssue({ code: "custom", message: "Hook targets 编码后长度超出限制。" });
    }
    for (const [index, target] of targets.entries()) {
      if (!isRepositoryRelativePath(target)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "File Mutation target 必须是使用正斜杠的仓库相对路径。",
        });
      }
    }
  });

const preFields = {
  event: z.literal(HarnessHookEvent.PreAction),
  idempotencyKey: nonBlank(256),
  actionKind: z.enum(ActionKind),
  targets: targetsSchema,
  inputDigest: contentDigestSchema,
  postconditionDigest: contentDigestSchema,
  baseRevision: nonBlank(512).optional(),
  recoveryGuidance: nonBlank(2_000),
  planRiskArtifactId: artifactIdSchema,
  planRiskArtifactDigest: artifactDigestSchema,
};

const legacyPreActionSchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_HOOK_SCHEMA_VERSION),
    ...sharedBase,
    ...preFields,
  })
  .strict();

const sessionPreActionSchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_SESSION_HOOK_SCHEMA_VERSION),
    ...sharedBase,
    sessionContext: sessionContextSchema,
    ...preFields,
  })
  .strict();

const postFields = {
  event: z.literal(HarnessHookEvent.PostAction),
  causationId: nonBlank(128),
  outcome: z.enum(ActionOutcome),
  evidenceIds: z.array(nonBlank(256)).superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: "Evidence ID 不能重复。" });
    }
  }),
  outputDigest: contentDigestSchema.optional(),
  errorCode: nonBlank(256).optional(),
  traceId: traceIdSchema,
  spanId: spanIdSchema,
  parentSpanId: spanIdSchema.optional(),
  toolName: nonBlank(256),
  toolCallId: nonBlank(256),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }),
};

/** PostAction 跨版本共享校验所需的字段类型。 */
type PostActionValidationInput = z.output<z.ZodObject<typeof postFields>>;

const legacyPostActionSchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_HOOK_SCHEMA_VERSION),
    ...sharedBase,
    ...postFields,
  })
  .strict()
  .superRefine(validatePostAction);

const sessionPostActionSchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_SESSION_HOOK_SCHEMA_VERSION),
    ...sharedBase,
    sessionContext: sessionContextSchema,
    ...postFields,
  })
  .strict()
  .superRefine(validatePostAction);

/** 根据 Event 与 Schema 版本严格解析 Action Hook Payload。 */
export function parseActionHookPayload(input: unknown): Result<ActionHookPayload, HarnessError> {
  const selector = z
    .object({
      event: z.enum(HarnessHookEvent),
      schemaVersion: z.enum([CANONICAL_HOOK_SCHEMA_VERSION, CANONICAL_SESSION_HOOK_SCHEMA_VERSION]),
    })
    .passthrough()
    .safeParse(input);
  if (!selector.success) return invalidHookPayload(selector.error);
  switch (selector.data.event) {
    case HarnessHookEvent.PreAction:
      return parsePreActionHookPayload(input);
    case HarnessHookEvent.PostAction:
      return parsePostActionHookPayload(input);
    case HarnessHookEvent.SessionStart:
    case HarnessHookEvent.UserPromptSubmit:
    case HarnessHookEvent.PreCompact:
    case HarnessHookEvent.PostCompact:
    case HarnessHookEvent.AgentStart:
    case HarnessHookEvent.AgentStop:
    case HarnessHookEvent.TurnStop:
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "当前 Dispatcher 仅支持 Action Hook。", {
          event: selector.data.event,
        }),
      );
  }
}

/** 严格解析 Legacy 或 Session-scoped PreAction Hook Payload。 */
export function parsePreActionHookPayload(
  input: unknown,
): Result<PreActionHookPayload, HarnessError> {
  const schema = readHookSchemaVersion(input);
  const parsed =
    schema === CANONICAL_SESSION_HOOK_SCHEMA_VERSION
      ? sessionPreActionSchema.safeParse(input)
      : legacyPreActionSchema.safeParse(input);
  return parsed.success ? success(compactPreAction(parsed.data)) : invalidHookPayload(parsed.error);
}

/** 严格解析 Legacy 或 Session-scoped PostAction Hook Payload。 */
export function parsePostActionHookPayload(
  input: unknown,
): Result<PostActionHookPayload, HarnessError> {
  const schema = readHookSchemaVersion(input);
  const parsed =
    schema === CANONICAL_SESSION_HOOK_SCHEMA_VERSION
      ? sessionPostActionSchema.safeParse(input)
      : legacyPostActionSchema.safeParse(input);
  return parsed.success
    ? success(compactPostAction(parsed.data))
    : invalidHookPayload(parsed.error);
}

function validatePostAction(payload: PostActionValidationInput, context: z.RefinementCtx): void {
  if (Date.parse(payload.endedAt) < Date.parse(payload.startedAt)) {
    context.addIssue({ code: "custom", message: "Tool 结束时间不能早于开始时间。" });
  }
  if (
    [ActionOutcome.Failed, ActionOutcome.OutcomeUnknown].includes(payload.outcome) &&
    payload.errorCode === undefined
  ) {
    context.addIssue({ code: "custom", message: "失败或未知结果必须提供 errorCode。" });
  }
  if (payload.parentSpanId === payload.spanId) {
    context.addIssue({ code: "custom", message: "Span 不能以自身作为父 Span。" });
  }
}

function compactPreAction(
  input: z.output<typeof legacyPreActionSchema> | z.output<typeof sessionPreActionSchema>,
): PreActionHookPayload {
  const { causationId, baseRevision, ...required } = input;
  return {
    ...required,
    ...(causationId === undefined ? {} : { causationId }),
    ...(baseRevision === undefined ? {} : { baseRevision }),
  };
}

function compactPostAction(
  input: z.output<typeof legacyPostActionSchema> | z.output<typeof sessionPostActionSchema>,
): PostActionHookPayload {
  const { outputDigest, errorCode, parentSpanId, ...required } = input;
  return {
    ...required,
    ...(outputDigest === undefined ? {} : { outputDigest }),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(parentSpanId === undefined ? {} : { parentSpanId }),
  };
}
