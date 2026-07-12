import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { parseArtifactDigest, parseArtifactId } from "#domain/artifact/index.js";
import { parseApprovalId } from "#domain/approval/index.js";
import {
  CodingTaskAttemptOutcome,
  CodingTaskControlAction,
  CodingTaskHumanResolution,
  CodingTaskVerificationOutcome,
  assertCodingTaskCreationBinding,
  assertCodingTaskExecutionAuthorization,
  normalizeWriteSet,
} from "#domain/codingTask/index.js";
import { GateEvaluationResult, GateId } from "#domain/policy/index.js";
import { FailureTaxonomy, parseInputBindingSet } from "#domain/workflow/index.js";
import { parseRepositoryId } from "#domain/workspace/index.js";
import { parseTaskId } from "#domain/task/index.js";

import type { CodingTaskCommandPayload, CreateCodingTaskPayload } from "../commands/index.js";
import { CodingTaskCommandType } from "../commands/index.js";

const nonBlank = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value === value.trim())
  .refine((value) => !value.includes("\0"));
const positiveInteger = z.number().int().positive().finite();
const workspaceId = nonBlank;
const repositoryId = parsedIdentifier(parseRepositoryId);
const sourceTaskId = parsedIdentifier(parseTaskId);
const artifactId = parsedIdentifier(parseArtifactId);
const artifactDigest = parsedIdentifier(parseArtifactDigest);
const approvalId = parsedIdentifier(parseApprovalId);
const inputBindingSet = z.unknown().transform((value, context) => {
  const result = parseInputBindingSet(value);
  if (result.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: result.error.message });
    return z.NEVER;
  }
  return result.value;
});
const relativeRepositoryPath = nonBlank.refine((value) => {
  if (
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("\\") ||
    /[<>:"|?*\u0000]/.test(value)
  ) {
    return false;
  }
  return value.split("/").every((segment) => segment !== "." && segment !== "..");
}, "必须是规范的相对 POSIX 路径。");
const worktreeBinding = z
  .object({
    worktreeId: nonBlank,
    relativePath: relativeRepositoryPath,
    branchName: nonBlank,
    managed: z.boolean(),
  })
  .strict();
const writeSet = z
  .array(relativeRepositoryPath)
  .min(1)
  .transform((value, context) => {
    try {
      return normalizeWriteSet(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof HarnessError ? error.message : "Write Set 无效。",
      });
      return z.NEVER;
    }
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
const executionAuthorization = z
  .object({
    planRisk: gateBinding,
    historicalLogicChange: z.boolean(),
    businessLogic: gateBinding.optional(),
  })
  .strict();

const createSchema = z
  .object({
    workspaceId,
    sourceTaskId,
    repositoryId,
    baseRevision: nonBlank,
    worktreeBinding,
    writeSet,
    inputBindingSet,
    executionAuthorization,
  })
  .strict();
const startSchema = z.object({ workspaceId, attemptNumber: positiveInteger }).strict();
const finishAttemptSchema = z
  .object({
    workspaceId,
    attemptNumber: positiveInteger,
    outcome: z.enum(CodingTaskAttemptOutcome),
    failureTaxonomy: z.enum(FailureTaxonomy).optional(),
  })
  .strict();
const requestVerificationSchema = z
  .object({ workspaceId, attemptNumber: positiveInteger })
  .strict();
const finishVerificationSchema = z
  .object({
    workspaceId,
    attemptNumber: positiveInteger,
    outcome: z.enum(CodingTaskVerificationOutcome),
    failureTaxonomy: z.enum(FailureTaxonomy).optional(),
  })
  .strict();
const controlSchema = z.object({ workspaceId, action: z.enum(CodingTaskControlAction) }).strict();
const resolveSchema = z
  .object({
    workspaceId,
    resolution: z.enum(CodingTaskHumanResolution),
    inputBindingSet: inputBindingSet.optional(),
  })
  .strict();

/** 解析并校验一个 CodingTask Command Payload。 */
export function parseCodingTaskPayload(
  type: CodingTaskCommandType,
  input: unknown,
): Result<CodingTaskCommandPayload, HarnessError> {
  const parsed = schemaForCommand(type).safeParse(input);
  if (!parsed.success) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "CodingTask Command Payload 无效。",
        { path: parsed.error.issues[0]?.path.join(".") ?? "unknown" },
        parsed.error,
      ),
    );
  }
  const value = parsed.data as unknown as CodingTaskCommandPayload;
  if (type === CodingTaskCommandType.Create) {
    const createPayload = value as CreateCodingTaskPayload;
    try {
      assertCodingTaskCreationBinding(createPayload.baseRevision, createPayload.worktreeBinding);
      assertCodingTaskExecutionAuthorization(createPayload.executionAuthorization);
    } catch (error) {
      return failure(
        error instanceof HarnessError
          ? error
          : new HarnessError(HarnessErrorCode.InvalidInput, "CodingTask 创建绑定无效。", {}, error),
      );
    }
  }
  return success(value);
}

/** 根据稳定 Command Type 选择严格的 Payload Schema。 */
function schemaForCommand(type: CodingTaskCommandType) {
  switch (type) {
    case CodingTaskCommandType.Create:
      return createSchema;
    case CodingTaskCommandType.StartAttempt:
      return startSchema;
    case CodingTaskCommandType.FinishAttempt:
      return finishAttemptSchema;
    case CodingTaskCommandType.RequestVerification:
      return requestVerificationSchema;
    case CodingTaskCommandType.FinishVerification:
      return finishVerificationSchema;
    case CodingTaskCommandType.Control:
      return controlSchema;
    case CodingTaskCommandType.ResolveHuman:
      return resolveSchema;
    default:
      throw new HarnessError(HarnessErrorCode.InvalidInput, "CodingTask Command Type 不受支持。");
  }
}

function parsedIdentifier<T>(parser: (value: string) => Result<T, HarnessError>): z.ZodType<T> {
  return z.string().transform((value, context) => {
    const result = parser(value);
    if (result.status === ResultStatus.Failure) {
      context.addIssue({ code: "custom", message: result.error.message });
      return z.NEVER;
    }
    return result.value;
  });
}
