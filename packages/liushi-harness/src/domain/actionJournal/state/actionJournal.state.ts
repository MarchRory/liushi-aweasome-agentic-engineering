import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { SESSION_ACTION_JOURNAL_SCHEMA_VERSION } from "../constants/index.js";
import type {
  ActionIntentRecord,
  ActionJournalState,
  ActionObservationRecord,
  ActionResolutionRecord,
  SessionActionProvenance,
} from "../contracts/index.js";
import {
  ActionJournalRecordType,
  ActionJournalStatus,
  ActionOutcome,
  ActionResolution,
} from "../enums/index.js";

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
  if (identityError !== undefined) return failure(identityError);
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
  if (identityError !== undefined) return failure(identityError);
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
      "Action record 绑定了错误的 Action 或 Task 作用域。",
    );
  }
  if (record.recordType === ActionJournalRecordType.Observation) {
    const mismatch = validateObservationBinding(state.intent, record);
    if (mismatch !== undefined) return mismatch;
  }
  if (record.sequence !== state.lastSequence + 1) {
    return new HarnessError(
      HarnessErrorCode.VersionConflict,
      "Action Journal sequence 已变化，必须重新加载后提交。",
      {
        expectedSequence: String(state.lastSequence + 1),
        actualSequence: String(record.sequence),
      },
    );
  }
  return undefined;
}

function validateObservationBinding(
  intent: ActionIntentRecord,
  observation: ActionObservationRecord,
): HarnessError | undefined {
  const intentIsSession = intent.schemaVersion === SESSION_ACTION_JOURNAL_SCHEMA_VERSION;
  const observationIsSession = observation.schemaVersion === SESSION_ACTION_JOURNAL_SCHEMA_VERSION;
  if (intentIsSession !== observationIsSession) {
    return new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Action Intent 与 Observation 的 Schema 版本不能混用。",
    );
  }
  if (intentIsSession && observationIsSession) {
    if (!sameProvenance(intent.sessionProvenance, observation.sessionProvenance)) {
      return new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Session Action Observation 的 provenance 与 Intent 不一致。",
      );
    }
    if (!sameTargets(intent.targets, observation.targets)) {
      return new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Session Action Observation 的 targets 与 Intent 不一致。",
      );
    }
  }
  return undefined;
}

function sameProvenance(left: SessionActionProvenance, right: SessionActionProvenance): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.codingTaskId === right.codingTaskId &&
    left.attemptNumber === right.attemptNumber &&
    left.worktreeId === right.worktreeId &&
    left.worktreeRootDigest === right.worktreeRootDigest &&
    left.activationBindingDigest === right.activationBindingDigest &&
    left.sessionBindingDigest === right.sessionBindingDigest &&
    left.executorSessionIdDigest === right.executorSessionIdDigest
  );
}

function sameTargets(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((target, index) => target === right[index]);
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
