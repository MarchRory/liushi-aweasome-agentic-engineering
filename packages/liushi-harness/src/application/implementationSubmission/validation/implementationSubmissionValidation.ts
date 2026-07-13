import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type Result,
} from "#common/index.js";
import { parseActionId, type ActionId } from "#domain/actionJournal/index.js";
import {
  CodingTaskPhase,
  CodingTaskRunState,
  type CodingTaskAggregate,
} from "#domain/codingTask/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

import type {
  ImplementationSubmissionRuntimeContext,
  SubmitImplementationCommandPayload,
} from "../contracts/index.js";

/** 已严格解析的实现收口载荷。 */
export interface ValidatedSubmitImplementationPayload {
  /** 已校验 Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 已校验 Action 标识。 */
  readonly actionId: ActionId;
  /** 当前 Attempt 序号。 */
  readonly attemptNumber: number;
  /** 已校验 Repository Root 摘要。 */
  readonly repositoryRootDigest: SubmitImplementationCommandPayload["repositoryRootDigest"];
}

const payloadSchema = z
  .object({
    workspaceId: z.string(),
    actionId: z.string(),
    attemptNumber: z.number().int().positive(),
    repositoryRootDigest: z.string(),
  })
  .strict();

/** 严格解析实现收口 Payload。 */
export function parseSubmitImplementationPayload(
  input: unknown,
): Result<ValidatedSubmitImplementationPayload, HarnessError> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return failure(invalid("payload"));
  const workspaceId = parseWorkspaceId(parsed.data.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const actionId = parseActionId(parsed.data.actionId);
  if (actionId.status === ResultStatus.Failure) return actionId;
  const repositoryRootDigest = parseContentDigest(parsed.data.repositoryRootDigest);
  if (repositoryRootDigest.status === ResultStatus.Failure) return repositoryRootDigest;
  return success({
    workspaceId: workspaceId.value,
    actionId: actionId.value,
    attemptNumber: parsed.data.attemptNumber,
    repositoryRootDigest: repositoryRootDigest.value,
  });
}

/** 校验本机 Repository Root 的输入形态。 */
export function validateImplementationSubmissionRuntime(
  input: ImplementationSubmissionRuntimeContext,
): Result<ImplementationSubmissionRuntimeContext, HarnessError> {
  const value = input?.repositoryRoot;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    !(value.startsWith("/") || value.startsWith("\\\\") || /^[A-Za-z]:[\\/]/u.test(value))
  ) {
    return failure(invalid("repositoryRoot"));
  }
  return success({ repositoryRoot: value });
}

/** 校验当前 Aggregate 是否允许创建或恢复实现提交。 */
export function validateImplementationSubmissionAggregate(
  aggregate: CodingTaskAggregate,
  payload: ValidatedSubmitImplementationPayload,
): Result<void, HarnessError> {
  const attempt = aggregate.attempts.at(-1);
  const invalidActiveAttempt =
    aggregate.phase !== CodingTaskPhase.Implementation ||
    aggregate.runState !== CodingTaskRunState.Active ||
    attempt?.number !== payload.attemptNumber ||
    attempt.finishedAt !== undefined;
  if (invalidActiveAttempt && !isSubmittedImplementationAttempt(aggregate, payload.attemptNumber)) {
    return failure(
      new HarnessError(HarnessErrorCode.OperationForbidden, "CodingTask 不允许当前实现提交。"),
    );
  }
  return success(undefined);
}

/** 判断目标 Attempt 是否已经由实现提交事件可靠收口。 */
export function isSubmittedImplementationAttempt(
  aggregate: CodingTaskAggregate,
  attemptNumber: number,
): boolean {
  const attempt = aggregate.attempts.at(-1);
  return (
    aggregate.phase === CodingTaskPhase.Verification &&
    attempt?.number === attemptNumber &&
    attempt.targetRevision !== undefined &&
    attempt.changedPaths !== undefined
  );
}

/** 比较已收口 Attempt 与实际 Git Checkpoint 是否完全一致。 */
export function matchesImplementationCheckpoint(
  aggregate: CodingTaskAggregate,
  attemptNumber: number,
  checkpoint: { readonly targetRevision: string; readonly changedPaths: readonly string[] },
): boolean {
  const attempt = aggregate.attempts.at(-1);
  return (
    isSubmittedImplementationAttempt(aggregate, attemptNumber) &&
    attempt?.targetRevision === checkpoint.targetRevision &&
    samePaths(attempt.changedPaths ?? [], checkpoint.changedPaths)
  );
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function invalid(field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "实现收口命令输入无效。", { field });
}
