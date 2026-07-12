import { z } from "zod";
import { CODING_TASK_EVENT_SCHEMA_VERSION, ResultStatus, actorRefSchema } from "#common/index.js";
import { parseArtifactDigest, parseArtifactId } from "#domain/artifact/index.js";
import { parseApprovalId } from "#domain/approval/index.js";
import { GateEvaluationResult, GateId } from "#domain/policy/index.js";
import { FailureTaxonomy, parseInputBindingSet } from "#domain/workflow/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";
import { parseTaskId } from "#domain/task/index.js";
import {
  CodingTaskAttemptOutcome,
  CodingTaskControlAction,
  CodingTaskHumanResolution,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
  CodingTaskEventType,
  parseCodingTaskEventId,
  parseCodingTaskId,
  type CodingTaskEvent,
} from "#domain/codingTask/index.js";

const text = (max = 256) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value === value.trim())
    .refine((value) => !value.includes("\0"));
const parsed = <T>(
  parse: (value: string) => { status: ResultStatus; value?: T; error?: { message: string } },
) =>
  z.string().transform((value, context) => {
    const result = parse(value);
    if (result.status === ResultStatus.Failure) {
      context.addIssue({ code: "custom", message: result.error?.message ?? "ID 无效。" });
      return z.NEVER;
    }
    return result.value as T;
  });
const taskId = parsed(parseCodingTaskId);
const eventId = parsed(parseCodingTaskEventId);
const workspaceId = parsed(parseWorkspaceId);
const repositoryId = parsed(parseRepositoryId);
const sourceTaskId = parsed(parseTaskId);
const artifactId = parsed(parseArtifactId);
const approvalId = parsed(parseApprovalId);
const artifactDigest = z
  .string()
  .refine((value) => parseArtifactDigest(value).status === ResultStatus.Success);
const inputBindingSet = z.unknown().transform((value, context) => {
  const result = parseInputBindingSet(value);
  if (result.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: result.error.message });
    return z.NEVER;
  }
  return result.value;
});
const gateBinding = z
  .object({
    artifactId,
    artifactDigest,
    result: z.enum(GateEvaluationResult),
    requiredGates: z.array(z.enum(GateId)),
    satisfiedApprovalIds: z.array(approvalId),
  })
  .strict();
const authorization = z
  .object({
    planRisk: gateBinding,
    historicalLogicChange: z.boolean(),
    businessLogic: gateBinding.optional(),
  })
  .strict();
const relativePath = text().refine((value) => {
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value) || value.includes("\\")) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}, "必须是规范的相对 POSIX 路径。");
const worktree = z
  .object({ worktreeId: text(), relativePath, branchName: text(), managed: z.boolean() })
  .strict();
const createdPayload = z
  .object({
    sourceTaskId,
    repositoryId,
    baseRevision: text(),
    worktreeBinding: worktree,
    writeSet: z.array(relativePath).min(1),
    inputBindingSet,
    executionAuthorization: authorization,
  })
  .strict();
const common = {
  schemaVersion: z.literal(CODING_TASK_EVENT_SCHEMA_VERSION),
  eventId,
  codingTaskId: taskId,
  workspaceId,
  sequence: z.number().int().positive(),
  commandId: text(),
  correlationId: text(),
  causationId: text().optional(),
  occurredAt: z.string().datetime({ offset: true }),
  actor: actorRefSchema,
  previousHash: z.string().regex(/^[a-f0-9]{64}$/),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
};
const eventSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...common,
      type: z.literal(CodingTaskEventType.CodingTaskCreated),
      payload: createdPayload,
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal(CodingTaskEventType.AttemptStarted),
      payload: z.object({ attemptNumber: z.number().int().positive() }).strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal(CodingTaskEventType.AttemptFinished),
      payload: z
        .object({
          attemptNumber: z.number().int().positive(),
          outcome: z.enum(CodingTaskAttemptOutcome),
          failureTaxonomy: z.enum(FailureTaxonomy).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal(CodingTaskEventType.VerificationRequested),
      payload: z.object({ attemptNumber: z.number().int().positive() }).strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal(CodingTaskEventType.VerificationFinished),
      payload: z
        .object({
          attemptNumber: z.number().int().positive(),
          outcome: z.enum(CodingTaskVerificationOutcome),
          failureTaxonomy: z.enum(FailureTaxonomy).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal(CodingTaskEventType.HumanControlApplied),
      payload: z
        .object({
          action: z.enum(CodingTaskControlAction),
          fromState: z.enum(CodingTaskRunState),
          toState: z.enum(CodingTaskRunState),
          requiresHuman: z.literal(true),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal(CodingTaskEventType.HumanResolutionApplied),
      payload: z
        .object({
          resolution: z.enum(CodingTaskHumanResolution),
          fromState: z.literal(CodingTaskRunState.WaitingHuman),
          toState: z.enum([CodingTaskRunState.Active, CodingTaskRunState.Cancelled]),
          inputBindingSet: inputBindingSet.optional(),
          requiresHuman: z.literal(true),
        })
        .strict(),
    })
    .strict(),
]);

/** 严格解析一条 CodingTask Event，未知字段和未知枚举值都会失败。 */
export function parseCodingTaskEvent(input: unknown): CodingTaskEvent {
  return eventSchema.parse(input) as CodingTaskEvent;
}
