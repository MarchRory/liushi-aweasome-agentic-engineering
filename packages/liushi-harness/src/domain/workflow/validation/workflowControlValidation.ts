import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import { WorkflowControlAction, WorkflowRunState } from "../enums/index.js";
import type { WorkflowControlDecision, WorkflowControlInput } from "../contracts/index.js";

/** 校验只有 Human 可以执行的 Workflow 暂停、恢复和取消动作。 */
export function validateWorkflowControl(
  input: WorkflowControlInput,
): Result<WorkflowControlDecision, HarnessError> {
  if (input.actorKind !== ActorKind.Human) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "Workflow 控制动作必须由 Human 发起。",
        {
          actorKind: String(input.actorKind),
        },
      ),
    );
  }
  const nextState = nextControlState(input);
  if (nextState.status === ResultStatus.Failure) return nextState;
  return success({
    action: input.action,
    currentState: input.currentState,
    nextState: nextState.value,
    requiresHuman: true,
  });
}

function nextControlState(input: WorkflowControlInput): Result<WorkflowRunState, HarnessError> {
  switch (input.action) {
    case WorkflowControlAction.Pause:
      return input.currentState === WorkflowRunState.Active
        ? success(WorkflowRunState.Paused)
        : invalidControl(input, "只有 Active Workflow 可以 Pause。");
    case WorkflowControlAction.Resume:
      return input.currentState === WorkflowRunState.Paused
        ? success(WorkflowRunState.Active)
        : invalidControl(input, "只有 Paused Workflow 可以 Resume。");
    case WorkflowControlAction.Cancel:
      return input.currentState === WorkflowRunState.Completed ||
        input.currentState === WorkflowRunState.Cancelled
        ? invalidControl(input, "Completed 或 Cancelled Workflow 不允许再次 Cancel。")
        : success(WorkflowRunState.Cancelled);
  }
}

function invalidControl(input: WorkflowControlInput, message: string): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.InvalidStateTransition, message, {
      action: input.action,
      currentState: input.currentState,
    }),
  );
}
