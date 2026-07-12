import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";

import { CodexHookEvent, CodexPermissionMode } from "../constants/index.js";
import type {
  CodexHookInput,
  CodexPostToolUseInput,
  CodexPreToolUseInput,
} from "../contracts/index.js";

const nonBlank = (maxLength: number): z.ZodString =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim())
    .refine((value) => !value.includes("\0"));

const baseSchema = {
  session_id: nonBlank(256),
  cwd: nonBlank(4_096),
  model: nonBlank(256),
  permission_mode: z.enum(CodexPermissionMode),
  turn_id: nonBlank(256),
  transcript_path: z.string().max(4_096).nullable().optional(),
  tool_name: nonBlank(256),
  tool_use_id: nonBlank(256),
  tool_input: z.unknown(),
};

const preToolUseSchema = z
  .object({
    ...baseSchema,
    hook_event_name: z.literal(CodexHookEvent.PreToolUse),
  })
  .strict();

const postToolUseSchema = z
  .object({
    ...baseSchema,
    hook_event_name: z.literal(CodexHookEvent.PostToolUse),
    tool_response: z.unknown(),
  })
  .strict();

/** 严格解析 Codex PreToolUse/PostToolUse Stdin JSON。 */
export function parseCodexHookInput(input: unknown): Result<CodexHookInput, HarnessErrorType> {
  if (!isRecord(input) || typeof input["hook_event_name"] !== "string") {
    return invalid("Codex Hook 输入缺少 hook_event_name。");
  }
  const eventName = input["hook_event_name"];
  if (!isCodexHookEvent(eventName)) return invalid("Codex Hook 事件未实现。");
  const parsed =
    eventName === CodexHookEvent.PreToolUse
      ? preToolUseSchema.safeParse(input)
      : eventName === CodexHookEvent.PostToolUse
        ? postToolUseSchema.safeParse(input)
        : undefined;
  if (parsed === undefined || !parsed.success) {
    return invalid(
      parsed === undefined ? "Codex Hook 事件未实现。" : parsed.error.issues[0]?.message,
    );
  }
  return success(parsed.data as CodexPreToolUseInput | CodexPostToolUseInput);
}

function isCodexHookEvent(value: string): value is CodexHookEvent {
  return Object.values(CodexHookEvent).includes(value as CodexHookEvent);
}

function invalid(message: string | undefined): Result<never, HarnessErrorType> {
  return failure(
    new HarnessError(HarnessErrorCode.InvalidInput, message ?? "Codex Hook 输入无效。"),
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
