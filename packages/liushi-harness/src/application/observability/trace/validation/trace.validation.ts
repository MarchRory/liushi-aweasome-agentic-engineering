import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  actorRefSchema,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { parseActionId, type ActionId } from "#domain/actionJournal/index.js";
import { parseTaskId, type TaskId } from "#domain/task/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

import {
  MAX_TRACE_ERROR_TYPE_LENGTH,
  MAX_TRACE_MODEL_ID_LENGTH,
  MAX_TRACE_OPERATION_NAME_LENGTH,
  MAX_TRACE_PROVIDER_LENGTH,
  MAX_TRACE_TOOL_NAME_LENGTH,
  TRACE_OBSERVATION_SCHEMA_VERSION,
} from "../constants/index.js";
import type { TraceModelUsage, TraceSpanObservation } from "../contracts/index.js";
import { TraceOperationKind, TraceSpanKind, TraceStatusCode } from "../enums/index.js";
import { parseSpanId, parseTraceId, type SpanId, type TraceId } from "../identity/index.js";

const nonBlank = (maxLength: number): z.ZodString =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim());

const brandedString = <T>(parser: (value: string) => Result<T, HarnessError>) =>
  z.string().transform((value, context): T => {
    const parsed = parser(value);
    if (parsed.status === ResultStatus.Failure) {
      context.addIssue({ code: "custom", message: parsed.error.message });
      return z.NEVER;
    }
    return parsed.value;
  });

const traceIdSchema = brandedString<TraceId>(parseTraceId);
const spanIdSchema = brandedString<SpanId>(parseSpanId);
const workspaceIdSchema = brandedString<WorkspaceId>(parseWorkspaceId);
const taskIdSchema = brandedString<TaskId>(parseTaskId);
const actionIdSchema = brandedString<ActionId>(parseActionId);
const tokenCount = z.number().int().nonnegative();

const modelSchema = z
  .object({
    provider: nonBlank(MAX_TRACE_PROVIDER_LENGTH),
    modelId: nonBlank(MAX_TRACE_MODEL_ID_LENGTH),
    inputTokens: tokenCount.optional(),
    outputTokens: tokenCount.optional(),
    cachedInputTokens: tokenCount.optional(),
    reasoningTokens: tokenCount.optional(),
    costUsd: z
      .string()
      .regex(/^(0|[1-9]\d*)(\.\d+)?$/u)
      .optional(),
  })
  .strict();

const toolSchema = z
  .object({
    toolName: nonBlank(MAX_TRACE_TOOL_NAME_LENGTH),
    toolCallId: nonBlank(256),
  })
  .strict();

const traceSpanSchema = z
  .object({
    schemaVersion: z.literal(TRACE_OBSERVATION_SCHEMA_VERSION),
    traceId: traceIdSchema,
    spanId: spanIdSchema,
    parentSpanId: spanIdSchema.optional(),
    workspaceId: workspaceIdSchema,
    taskId: taskIdSchema,
    commandId: nonBlank(128),
    correlationId: nonBlank(128),
    causationId: nonBlank(128).optional(),
    actionId: actionIdSchema.optional(),
    actor: actorRefSchema,
    operationKind: z.enum(TraceOperationKind),
    operationName: nonBlank(MAX_TRACE_OPERATION_NAME_LENGTH),
    spanKind: z.enum(TraceSpanKind),
    status: z.enum(TraceStatusCode),
    errorType: nonBlank(MAX_TRACE_ERROR_TYPE_LENGTH).optional(),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    model: modelSchema.optional(),
    tool: toolSchema.optional(),
  })
  .strict()
  .superRefine((span, context) => {
    if (Date.parse(span.endedAt) < Date.parse(span.startedAt)) {
      context.addIssue({
        code: "custom",
        message: "endedAt 不能早于 startedAt。",
        path: ["endedAt"],
      });
    }
    if (span.status === TraceStatusCode.Error && span.errorType === undefined) {
      context.addIssue({
        code: "custom",
        message: "Error Span 必须提供 errorType。",
        path: ["errorType"],
      });
    }
    if (span.operationKind === TraceOperationKind.Model && span.model === undefined) {
      context.addIssue({ code: "custom", message: "Model Span 必须提供 model。", path: ["model"] });
    }
    if (span.operationKind === TraceOperationKind.Tool && span.tool === undefined) {
      context.addIssue({ code: "custom", message: "Tool Span 必须提供 tool。", path: ["tool"] });
    }
    if (span.parentSpanId === span.spanId) {
      context.addIssue({
        code: "custom",
        message: "Span 不能以自身作为父 Span。",
        path: ["parentSpanId"],
      });
    }
  });

/** 严格解析不受信任的完成态 Trace Span Observation。 */
export function parseTraceSpanObservation(
  input: unknown,
): Result<TraceSpanObservation, HarnessError> {
  const parsed = traceSpanSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Trace Span Observation 无效。",
        { path: issue?.path.join(".") ?? "unknown", issue: issue?.message ?? "unknown" },
        parsed.error,
      ),
    );
  }
  const { parentSpanId, causationId, actionId, errorType, model, tool, ...required } = parsed.data;
  return success({
    ...required,
    ...(parentSpanId === undefined ? {} : { parentSpanId }),
    ...(causationId === undefined ? {} : { causationId }),
    ...(actionId === undefined ? {} : { actionId }),
    ...(errorType === undefined ? {} : { errorType }),
    ...(model === undefined ? {} : { model: compactModel(model) }),
    ...(tool === undefined ? {} : { tool }),
  });
}

function compactModel(model: z.infer<typeof modelSchema>): TraceModelUsage {
  const { inputTokens, outputTokens, cachedInputTokens, reasoningTokens, costUsd, ...required } =
    model;
  return {
    ...required,
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(costUsd === undefined ? {} : { costUsd }),
  };
}
