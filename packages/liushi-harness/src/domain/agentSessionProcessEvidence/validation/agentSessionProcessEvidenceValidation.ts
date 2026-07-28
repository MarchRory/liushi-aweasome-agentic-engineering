import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import { parseCodingTaskId } from "#domain/codingTask/index.js";
import { parseCodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import { AGENT_SESSION_PROCESS_EVIDENCE_TEXT_MAX_LENGTH } from "../constants/index.js";
import type {
  AgentSessionProcessEvidence,
  AgentSessionProcessEvidenceDigestPort,
  AgentSessionProcessEvidenceInput,
} from "../contracts/index.js";
import {
  AgentSessionProcessEvidenceSchemaVersion,
  AgentSessionProcessHostSurface,
  AgentSessionProcessOutcome,
} from "../enums/index.js";

const text = z
  .string()
  .min(1)
  .max(AGENT_SESSION_PROCESS_EVIDENCE_TEXT_MAX_LENGTH)
  .refine((value) => value === value.trim() && !value.includes("\0"));
const isoUtc = z
  .string()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      new Date(value).toISOString() === value,
  );
const digest = z.string().transform((value, context): ContentDigest => {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: "摘要无效。" });
    return z.NEVER;
  }
  return parsed.value;
});
const branded = <T>(parser: (value: string) => Result<T, HarnessError>) =>
  z.string().transform((value, context): T => {
    const parsed = parser(value);
    if (parsed.status === ResultStatus.Failure) {
      context.addIssue({ code: "custom", message: "标识无效。" });
      return z.NEVER;
    }
    return parsed.value;
  });
const fields = {
  schemaVersion: z.nativeEnum(AgentSessionProcessEvidenceSchemaVersion),
  workspaceId: branded(parseWorkspaceId),
  sessionId: branded(parseCodingTaskSessionId),
  codingTaskId: branded(parseCodingTaskId),
  sourceTaskId: branded(parseTaskId),
  attemptNumber: z.number().int().positive().safe(),
  worktreeId: text,
  worktreeRootDigest: digest,
  activationBindingDigest: digest,
  sessionBindingDigest: digest,
  executorSessionIdDigest: digest,
  executorId: text,
  executorVersion: text,
  executableDigest: digest,
  hostSurface: z.nativeEnum(AgentSessionProcessHostSurface),
  modelId: text,
  reasoningEffort: text,
  permissionMode: text,
  promptDigest: digest,
  hookConfigDigest: digest,
  startedAt: isoUtc,
  completedAt: isoUtc,
  durationMs: z.number().int().nonnegative().safe(),
  outcome: z.nativeEnum(AgentSessionProcessOutcome),
  exitCode: z.number().int().safe().nullable(),
  signal: text.nullable(),
  timedOut: z.boolean(),
} as const;
const inputSchema = z.object(fields).strict().superRefine(validateOutcome);
const evidenceSchema = z
  .object({ ...fields, evidenceDigest: digest })
  .strict()
  .superRefine(validateOutcome);

/** 创建规范化的不可变进程证据并计算摘要。 */
export function createAgentSessionProcessEvidence(
  input: unknown,
  digestPort: AgentSessionProcessEvidenceDigestPort,
): Result<AgentSessionProcessEvidence, HarnessError> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || !hasValidDuration(parsed.data))
    return invalid("进程证据输入无效。", parsed.success ? undefined : parsed.error);
  const normalized: AgentSessionProcessEvidenceInput = parsed.data;
  const calculated = digestPort.calculate(toDigestInput(normalized));
  if (calculated.status === ResultStatus.Failure) return calculated;
  const verified = parseContentDigest(calculated.value);
  return verified.status === ResultStatus.Failure
    ? invalid("进程证据摘要无效。")
    : success(Object.freeze({ ...normalized, evidenceDigest: verified.value }));
}

/** 严格重建持久化证据并复验摘要。 */
export function rebuildAgentSessionProcessEvidence(
  input: unknown,
  digestPort: AgentSessionProcessEvidenceDigestPort,
): Result<AgentSessionProcessEvidence, HarnessError> {
  const parsed = evidenceSchema.safeParse(input);
  if (!parsed.success || !hasValidDuration(parsed.data))
    return invalid("持久化进程证据无效。", parsed.success ? undefined : parsed.error);
  const evidence: AgentSessionProcessEvidence = parsed.data;
  const calculated = digestPort.calculate(toDigestInput(evidence));
  if (calculated.status === ResultStatus.Failure) return calculated;
  return calculated.value === evidence.evidenceDigest
    ? success(Object.freeze({ ...evidence }))
    : failure(
        new HarnessError(HarnessErrorCode.PreconditionNotMet, "进程证据摘要漂移。", {
          field: "evidenceDigest",
        }),
      );
}

/** 判断证据是否能够作为成功 Coverage 的进程闭合证明。 */
export function isCompletedAgentSessionProcessEvidence(
  evidence: AgentSessionProcessEvidence,
): boolean {
  return (
    evidence.outcome === AgentSessionProcessOutcome.Completed &&
    evidence.exitCode === 0 &&
    evidence.signal === null &&
    !evidence.timedOut
  );
}

function validateOutcome(
  value: {
    outcome: AgentSessionProcessOutcome;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
  },
  context: z.RefinementCtx,
): void {
  const valid =
    (value.outcome === AgentSessionProcessOutcome.Completed &&
      value.exitCode === 0 &&
      value.signal === null &&
      !value.timedOut) ||
    (value.outcome === AgentSessionProcessOutcome.Failed &&
      value.exitCode !== null &&
      value.exitCode !== 0 &&
      value.signal === null &&
      !value.timedOut) ||
    (value.outcome === AgentSessionProcessOutcome.TimedOut &&
      value.exitCode === null &&
      value.signal === null &&
      value.timedOut) ||
    (value.outcome === AgentSessionProcessOutcome.Signaled &&
      value.exitCode === null &&
      value.signal !== null &&
      !value.timedOut);
  if (!valid) context.addIssue({ code: "custom", message: "进程终态与退出事实不一致。" });
}
function hasValidDuration(value: {
  startedAt: string;
  completedAt: string;
  durationMs: number;
}): boolean {
  return (
    Date.parse(value.completedAt) >= Date.parse(value.startedAt) &&
    Date.parse(value.completedAt) - Date.parse(value.startedAt) === value.durationMs
  );
}
function toDigestInput(
  input: AgentSessionProcessEvidenceInput | AgentSessionProcessEvidence,
): AgentSessionProcessEvidenceInput {
  if ("evidenceDigest" in input) {
    const { evidenceDigest, ...digestInput } = input;
    void evidenceDigest;
    return digestInput;
  }
  return { ...input };
}
function invalid(message: string, cause?: unknown): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, {}, cause));
}
