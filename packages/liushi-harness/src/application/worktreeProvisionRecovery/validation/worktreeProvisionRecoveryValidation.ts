import { z } from "zod";

import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type Result,
} from "#common/index.js";
import { parseActionId, type ActionId } from "#domain/actionJournal/index.js";
import { parseCodingTaskId, type CodingTaskId } from "#domain/codingTask/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import { CODING_TASK_AGGREGATE_TYPE } from "#application/codingTask/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";

import { WORKTREE_PROVISION_RECONCILE_COMMAND_TYPE } from "../constants/index.js";
import type {
  AssessWorktreeProvisionRecoveryInput,
  ReconcileWorktreeProvisionCommandPayload,
} from "../contracts/index.js";

/** 已验证的 Worktree Provision 恢复定位信息。 */
export interface ValidatedWorktreeProvisionRecoveryLocator {
  /** 已验证的 Workspace ID。 */
  readonly workspaceId: WorkspaceId;
  /** 已验证的 CodingTask ID。 */
  readonly codingTaskId: CodingTaskId;
  /** 已验证的原 Action ID。 */
  readonly actionId: ActionId;
}

/** 已验证的 Worktree Provision 对账命令 Payload。 */
export interface ValidatedReconcileWorktreeProvisionPayload {
  /** 已验证的 Workspace ID。 */
  readonly workspaceId: WorkspaceId;
  /** 已验证的原 Action ID。 */
  readonly actionId: ActionId;
  /** 已验证的 Human 评估摘要。 */
  readonly expectedAssessmentDigest: ReconcileWorktreeProvisionCommandPayload["expectedAssessmentDigest"];
}

const assessmentInputSchema = z
  .object({ workspaceId: z.string(), codingTaskId: z.string(), actionId: z.string() })
  .strict();

const commandPayloadSchema = z
  .object({
    workspaceId: z.string(),
    actionId: z.string(),
    expectedAssessmentDigest: z.string(),
  })
  .strict();

/** 严格解析公开的恢复评估输入。 */
export function parseWorktreeProvisionRecoveryLocator(
  input: AssessWorktreeProvisionRecoveryInput,
): Result<ValidatedWorktreeProvisionRecoveryLocator, HarnessError> {
  const parsed = assessmentInputSchema.safeParse(input);
  if (!parsed.success) return failure(invalid("input"));
  const workspaceId = parseWorkspaceId(parsed.data.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const codingTaskId = parseCodingTaskId(parsed.data.codingTaskId);
  if (codingTaskId.status === ResultStatus.Failure) return codingTaskId;
  const actionId = parseActionId(parsed.data.actionId);
  if (actionId.status === ResultStatus.Failure) return actionId;
  return success({
    workspaceId: workspaceId.value,
    codingTaskId: codingTaskId.value,
    actionId: actionId.value,
  });
}

/** 校验 Human 对账命令的类型、作用域、Payload 与摘要。 */
export function validateReconcileWorktreeProvisionEnvelope(
  digest: ContentDigestPort,
  command: CommandEnvelope,
): Result<ValidatedReconcileWorktreeProvisionPayload, HarnessError> {
  if (
    command.commandType !== WORKTREE_PROVISION_RECONCILE_COMMAND_TYPE ||
    command.aggregateType !== CODING_TASK_AGGREGATE_TYPE
  ) {
    return failure(invalid("commandType"));
  }
  if (command.actor.kind !== ActorKind.Human) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "Worktree Provision 恢复对账只能由 Human 提交。",
      ),
    );
  }
  const parsed = commandPayloadSchema.safeParse(command.payload);
  if (!parsed.success) return failure(invalid("payload"));
  const workspaceId = parseWorkspaceId(parsed.data.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const actionId = parseActionId(parsed.data.actionId);
  if (actionId.status === ResultStatus.Failure) return actionId;
  const expectedAssessmentDigest = parseContentDigest(parsed.data.expectedAssessmentDigest);
  if (expectedAssessmentDigest.status === ResultStatus.Failure) return expectedAssessmentDigest;
  const requestDigest = digest.calculate(command.payload);
  if (requestDigest.status === ResultStatus.Failure) return requestDigest;
  if (requestDigest.value !== command.requestDigest) return failure(invalid("requestDigest"));
  return success({
    workspaceId: workspaceId.value,
    actionId: actionId.value,
    expectedAssessmentDigest: expectedAssessmentDigest.value,
  });
}

function invalid(field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "Worktree Provision 恢复输入无效。", {
    field,
  });
}
