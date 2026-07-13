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
import { validateVerificationPlan } from "#domain/verification/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";
import { FailureTaxonomy } from "#domain/workflow/index.js";

import type {
  RunVerificationCommandPayload,
  VerificationCommandRuntimeContext,
} from "../contracts/index.js";

/** 已严格解析的 Verification Command Payload。 */
export interface ValidatedRunVerificationPayload {
  /** 已校验的 Workspace ID。 */
  readonly workspaceId: WorkspaceId;
  /** 已校验的 Action ID。 */
  readonly actionId: ActionId;
  /** 验证运行标识。 */
  readonly verificationRunId: RunVerificationCommandPayload["verificationRunId"];
  /** 当前实现尝试序号。 */
  readonly attemptNumber: RunVerificationCommandPayload["attemptNumber"];
  /** Worktree Root 摘要绑定。 */
  readonly worktreeRootDigest: RunVerificationCommandPayload["worktreeRootDigest"];
  /** 已确认的验证计划。 */
  readonly plan: RunVerificationCommandPayload["plan"];
  /** 明确失败时采用的业务分类。 */
  readonly failedVerificationTaxonomy: RunVerificationCommandPayload["failedVerificationTaxonomy"];
}

const payloadSchema = z
  .object({
    workspaceId: z.string(),
    actionId: z.string(),
    verificationRunId: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/u),
    attemptNumber: z.number().int().positive(),
    worktreeRootDigest: z.string(),
    plan: z.unknown(),
    failedVerificationTaxonomy: z.enum([
      FailureTaxonomy.ImplementationDefect,
      FailureTaxonomy.RequirementOrSolutionGap,
    ]),
  })
  .strict();

/** 严格解析 Verification Run Command Payload。 */
export function parseRunVerificationPayload(
  input: unknown,
): Result<ValidatedRunVerificationPayload, HarnessError> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return failure(invalid("payload"));
  const workspaceId = parseWorkspaceId(parsed.data.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const actionId = parseActionId(parsed.data.actionId);
  if (actionId.status === ResultStatus.Failure) return actionId;
  const worktreeRootDigest = parseContentDigest(parsed.data.worktreeRootDigest);
  if (worktreeRootDigest.status === ResultStatus.Failure) return worktreeRootDigest;
  const plan = validateVerificationPlan(parsed.data.plan);
  if (plan.status === ResultStatus.Failure) return plan;
  return success({
    ...parsed.data,
    workspaceId: workspaceId.value,
    actionId: actionId.value,
    worktreeRootDigest: worktreeRootDigest.value,
    plan: plan.value,
  });
}

/** 校验不持久化的本机 Worktree Root。 */
export function validateVerificationRuntime(
  input: VerificationCommandRuntimeContext,
): Result<VerificationCommandRuntimeContext, HarnessError> {
  if (
    input === null ||
    typeof input !== "object" ||
    typeof input.worktreeRoot !== "string" ||
    input.worktreeRoot.length === 0 ||
    input.worktreeRoot.length > 4096 ||
    /[\u0000-\u001f\u007f]/u.test(input.worktreeRoot) ||
    !isAbsolutePath(input.worktreeRoot)
  ) {
    return failure(invalid("worktreeRoot"));
  }
  return success({ worktreeRoot: input.worktreeRoot });
}

/** 校验 CodingTask 当前尝试与 Verification Plan 的完整修订绑定。 */
export function validateVerificationAggregate(
  aggregate: CodingTaskAggregate,
  payload: ValidatedRunVerificationPayload,
): Result<void, HarnessError> {
  const attempt = aggregate.attempts.at(-1);
  if (
    aggregate.phase !== CodingTaskPhase.Verification ||
    aggregate.runState !== CodingTaskRunState.Active ||
    attempt?.number !== payload.attemptNumber ||
    aggregate.repositoryId !== payload.plan.repositoryId ||
    aggregate.worktreeBinding.worktreeId !== payload.plan.worktreeId ||
    aggregate.worktreeBinding.branchName !== payload.plan.expectedBranchName ||
    aggregate.baseRevision !== payload.plan.baseRevision ||
    attempt?.targetRevision === undefined ||
    attempt.targetRevision !== payload.plan.targetRevision
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidStateTransition,
        "CodingTask 与 Verification Plan 不兼容。",
      ),
    );
  }
  return success(undefined);
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\\\") || /^[A-Za-z]:[\\/]/u.test(value);
}

function invalid(field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "Verification Command 输入无效。", {
    field,
  });
}
