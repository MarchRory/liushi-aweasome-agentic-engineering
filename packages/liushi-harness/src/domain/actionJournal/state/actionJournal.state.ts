import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import type {
  ActionIntentRecord,
  ActionJournalState,
  ActionObservationRecord,
  ActionResolutionRecord,
} from "../contracts/index.js";
import { ActionJournalStatus, ActionOutcome, ActionResolution } from "../enums/index.js";

/** 从已持久化 Intent 创建 Action Journal 初始状态。 */
export function createActionJournalState(intent: ActionIntentRecord): ActionJournalState {
  return {
    intent,
    observations: [],
    resolutions: [],
    lastSequence: intent.sequence,
    status: ActionJournalStatus.IntentRecorded,
  };
}

/** 在合法状态下追加一次执行或恢复检查 Observation。 */
export function appendActionObservation(
  state: ActionJournalState,
  observation: ActionObservationRecord,
): Result<ActionJournalState, HarnessError> {
  const allowed = [
    ActionJournalStatus.IntentRecorded,
    ActionJournalStatus.RetryPermitted,
    ActionJournalStatus.WaitingHuman,
  ];
  const identityError = validateRecordIdentity(state, observation);
  if (identityError !== undefined) {
    return failure(identityError);
  }
  if (!allowed.includes(state.status)) {
    return invalidTransition(state, "当前状态不允许追加 Action Observation。");
  }
  return success({
    ...state,
    observations: [...state.observations, observation],
    lastSequence: observation.sequence,
    status: ActionJournalStatus.AwaitingResolution,
  });
}

/** 根据最新 Observation 追加确定性 Resolution。 */
export function appendActionResolution(
  state: ActionJournalState,
  resolution: ActionResolutionRecord,
): Result<ActionJournalState, HarnessError> {
  const identityError = validateRecordIdentity(state, resolution);
  if (identityError !== undefined) {
    return failure(identityError);
  }
  const latest = state.observations[state.observations.length - 1];
  if (state.status !== ActionJournalStatus.AwaitingResolution || latest === undefined) {
    return invalidTransition(state, "没有等待处置的 Action Observation。");
  }
  if (!isCompatibleResolution(latest.outcome, resolution.resolution)) {
    return invalidTransition(state, "Action Outcome 与 Resolution 不兼容。");
  }
  return success({
    ...state,
    resolutions: [...state.resolutions, resolution],
    lastSequence: resolution.sequence,
    status: resolutionStatus(resolution.resolution),
  });
}

function validateRecordIdentity(
  state: ActionJournalState,
  record: ActionObservationRecord | ActionResolutionRecord,
): HarnessError | undefined {
  if (
    record.actionId !== state.intent.actionId ||
    record.workspaceId !== state.intent.workspaceId ||
    record.taskId !== state.intent.taskId
  ) {
    return new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Action Record 绑定了错误的 Action 或 Task 作用域。",
    );
  }
  if (record.sequence !== state.lastSequence + 1) {
    return new HarnessError(
      HarnessErrorCode.VersionConflict,
      "Action Journal Sequence 已变化，必须重新加载后提交。",
      {
        expectedSequence: String(state.lastSequence + 1),
        actualSequence: String(record.sequence),
      },
    );
  }
  return undefined;
}

function isCompatibleResolution(outcome: ActionOutcome, resolution: ActionResolution): boolean {
  switch (outcome) {
    case ActionOutcome.Succeeded:
      return [ActionResolution.Committed, ActionResolution.Recovered].includes(resolution);
    case ActionOutcome.NotApplied:
      return resolution === ActionResolution.RetryPermitted;
    case ActionOutcome.Failed:
    case ActionOutcome.OutcomeUnknown:
      return resolution === ActionResolution.HumanRequired;
  }
}

function resolutionStatus(resolution: ActionResolution): ActionJournalStatus {
  switch (resolution) {
    case ActionResolution.Committed:
      return ActionJournalStatus.Committed;
    case ActionResolution.Recovered:
      return ActionJournalStatus.Recovered;
    case ActionResolution.RetryPermitted:
      return ActionJournalStatus.RetryPermitted;
    case ActionResolution.HumanRequired:
      return ActionJournalStatus.WaitingHuman;
  }
}

function invalidTransition(
  state: ActionJournalState,
  message: string,
): Result<ActionJournalState, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.InvalidStateTransition, message, {
      actionId: state.intent.actionId,
      status: state.status,
    }),
  );
}
