import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { ActionJournalStatus, parseActionId } from "#domain/actionJournal/index.js";
import { beginClosing } from "#domain/codingTaskSession/index.js";

import type {
  CodingTaskSessionAdmissionCoordinatorDependencies,
  CodingTaskSessionBeginClosingInput,
  CodingTaskSessionBeginClosingResult,
} from "../contracts/index.js";

/** 在 Admission Lease 内复验全部已准入 Action，并进入 closing。 */
export async function closeCodingTaskSessionAdmission(
  dependencies: CodingTaskSessionAdmissionCoordinatorDependencies,
  input: CodingTaskSessionBeginClosingInput,
): Promise<Result<CodingTaskSessionBeginClosingResult, HarnessError>> {
  const locator = { workspaceId: input.workspaceId, sessionId: input.sessionId };
  const binding = await dependencies.bindingStore.findSession(locator);
  if (binding.status === ResultStatus.Failure) return binding;
  const activation = await dependencies.activationRepository.load(locator);
  if (activation.status === ResultStatus.Failure) return activation;
  const state = await dependencies.stateStore.load(locator);
  if (state.status === ResultStatus.Failure) return state;
  if (
    binding.value.activationBindingDigest !== activation.value.bindingDigest ||
    binding.value.sessionBindingDigest !== state.value.sessionBindingDigest ||
    state.value.activationBindingDigest !== activation.value.bindingDigest
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "关闭 Admission 前发现 Binding、Activation 与 State 身份不一致。",
      ),
    );
  }

  for (const actionIdValue of state.value.admittedActionIds) {
    const actionId = parseActionId(actionIdValue);
    if (actionId.status === ResultStatus.Failure) return actionId;
    const action = await dependencies.actionJournal.load({
      workspaceId: input.workspaceId,
      taskId: activation.value.sourceTaskId,
      actionId: actionId.value,
    });
    if (action.status === ResultStatus.Failure) return action;
    if (
      ![ActionJournalStatus.Committed, ActionJournalStatus.Recovered].includes(action.value.status)
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "存在未由成功或恢复证据闭合的已准入 Action，不能进入 closing。",
          { actionId: actionIdValue, actionStatus: action.value.status },
        ),
      );
    }
  }
  const closing = beginClosing(state.value, { updatedAt: input.updatedAt });
  if (closing.status === ResultStatus.Failure) return closing;
  const persisted = await dependencies.stateStore.replace({
    expectedVersion: state.value.version,
    state: closing.value,
  });
  return persisted.status === ResultStatus.Failure
    ? persisted
    : success({ state: persisted.value });
}
