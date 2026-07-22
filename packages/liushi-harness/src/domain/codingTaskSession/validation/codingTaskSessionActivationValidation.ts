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
import {
  parseArtifactDigest,
  parseArtifactId,
  type ArtifactDigest,
  type ArtifactId,
} from "#domain/artifact/index.js";
import { parseCodingTaskId, type CodingTaskId } from "#domain/codingTask/index.js";
import { parseTaskId, type TaskId } from "#domain/task/index.js";
import {
  parseRepositoryId,
  parseWorkspaceId,
  type RepositoryId,
  type WorkspaceId,
} from "#domain/workspace/index.js";

import { CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CodingTaskSessionActivationBindingDigestInput,
  CodingTaskSessionActivationDigestPort,
  CodingTaskSessionActivationRecord,
  CodingTaskSessionActivationRecordInput,
} from "../contracts/index.js";
import { parseCodingTaskSessionId, type CodingTaskSessionId } from "../identifiers/index.js";

const nonBlank = (field: string): z.ZodString =>
  z
    .string()
    .min(1)
    .max(256)
    .refine((value) => value === value.trim(), { message: `${field} 不得包含首尾空白。` })
    .refine((value) => !value.includes("\0"), { message: `${field} 不得包含 NUL。` });

const isoUtc = z.string().refine(isIsoUtc, { message: "时间必须是规范 ISO UTC。" });

const parsed = <T>(field: string, parser: (value: string) => Result<T, HarnessError>) =>
  z.string().transform((value, context): T => {
    const result = parser(value);
    if (result.status === ResultStatus.Failure) {
      context.addIssue({ code: "custom", message: `${field} 无效。` });
      return z.NEVER;
    }
    return result.value;
  });

const digest = z.string().transform((value, context): ContentDigest => {
  const result = parseContentDigest(value);
  if (result.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: "Content Digest 无效。" });
    return z.NEVER;
  }
  return result.value;
});

const activationFields = {
  schemaVersion: z.literal(CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION),
  sessionId: parsed("sessionId", parseCodingTaskSessionId),
  workspaceId: parsed("workspaceId", parseWorkspaceId),
  codingTaskId: parsed("codingTaskId", parseCodingTaskId),
  sourceTaskId: parsed("sourceTaskId", parseTaskId),
  repositoryId: parsed("repositoryId", parseRepositoryId),
  attemptNumber: z.number().int().positive().safe(),
  attemptStartedAt: isoUtc,
  worktreeId: nonBlank("worktreeId"),
  worktreeRootDigest: digest,
  planRiskArtifactId: parsed("planRiskArtifactId", parseArtifactId),
  planRiskArtifactDigest: parsed("planRiskArtifactDigest", parseArtifactDigest),
  agentActorId: nonBlank("agentActorId"),
  activatedAt: isoUtc,
} as const;

const recordInputSchema = z.object(activationFields).strict();
const recordSchema = z.object({ ...activationFields, bindingDigest: digest }).strict();

/** 创建并计算新的不可变 Activation Record。 */
export function createCodingTaskSessionActivationRecord(
  input: unknown,
  digestPort: CodingTaskSessionActivationDigestPort,
): Result<CodingTaskSessionActivationRecord, HarnessError> {
  const parsedInput = recordInputSchema.safeParse(input);
  if (!parsedInput.success) return invalid("Activation Record 输入无效。", parsedInput.error);
  const normalized = parsedInput.data as CodingTaskSessionActivationRecordInput;
  const bindingDigest = calculateBindingDigest(normalized, digestPort);
  if (bindingDigest.status === ResultStatus.Failure) return bindingDigest;
  return success(Object.freeze({ ...normalized, bindingDigest: bindingDigest.value }));
}

/** 严格重建持久化 Activation Record，并复验规范字段与 Binding Digest。 */
export function rebuildCodingTaskSessionActivationRecord(
  input: unknown,
  digestPort: CodingTaskSessionActivationDigestPort,
): Result<CodingTaskSessionActivationRecord, HarnessError> {
  const parsedRecord = recordSchema.safeParse(input);
  if (!parsedRecord.success) return invalid("持久化 Activation Record 无效。", parsedRecord.error);
  const record = parsedRecord.data as CodingTaskSessionActivationRecord;
  const expectedDigest = calculateBindingDigest(record, digestPort);
  if (expectedDigest.status === ResultStatus.Failure) return expectedDigest;
  if (expectedDigest.value !== record.bindingDigest) {
    return failure(
      new HarnessError(HarnessErrorCode.PreconditionNotMet, "Activation Binding Digest 漂移。", {
        field: "bindingDigest",
      }),
    );
  }
  return success(Object.freeze({ ...record }));
}

function calculateBindingDigest(
  input: CodingTaskSessionActivationBindingDigestInput,
  digestPort: CodingTaskSessionActivationDigestPort,
): Result<ContentDigest, HarnessError> {
  const calculated = digestPort.calculate(toBindingDigestInput(input));
  if (calculated.status === ResultStatus.Failure) return calculated;
  const parsed = parseContentDigest(calculated.value);
  return parsed.status === ResultStatus.Failure
    ? failure(new HarnessError(HarnessErrorCode.InvalidInput, "Binding Digest 无效。"))
    : parsed;
}

function toBindingDigestInput(
  input: CodingTaskSessionActivationBindingDigestInput,
): CodingTaskSessionActivationBindingDigestInput {
  return {
    schemaVersion: input.schemaVersion,
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    codingTaskId: input.codingTaskId,
    sourceTaskId: input.sourceTaskId,
    repositoryId: input.repositoryId,
    attemptNumber: input.attemptNumber,
    attemptStartedAt: input.attemptStartedAt,
    worktreeId: input.worktreeId,
    worktreeRootDigest: input.worktreeRootDigest,
    planRiskArtifactId: input.planRiskArtifactId,
    planRiskArtifactDigest: input.planRiskArtifactDigest,
    agentActorId: input.agentActorId,
    activatedAt: input.activatedAt,
  };
}

function isIsoUtc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function invalid(message: string, cause?: unknown): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, {}, cause));
}

export type {
  ArtifactDigest,
  ArtifactId,
  CodingTaskId,
  CodingTaskSessionId,
  RepositoryId,
  TaskId,
  WorkspaceId,
};
