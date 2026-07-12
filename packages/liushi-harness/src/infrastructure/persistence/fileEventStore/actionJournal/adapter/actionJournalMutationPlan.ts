import { ActionJournalMutationDisposition } from "#application/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ActionJournalStatus,
  appendActionObservation,
  appendActionResolution,
  type ActionId,
  type ActionIntentRecord,
  type ActionJournalRecord,
  type ActionJournalState,
  type ActionObservationRecord,
  type ActionResolutionRecord,
} from "#domain/actionJournal/index.js";

/** 持锁计算出的单次 Action Journal Mutation 计划。 */
export interface ActionMutationPlan {
  /** Mutation 后的确定性状态。 */
  readonly state: ActionJournalState;
  /** 需要追加的 Record；幂等复用时不存在。 */
  readonly record?: ActionJournalRecord;
  /** 本次 Mutation 的持久化处置。 */
  readonly disposition: ActionJournalMutationDisposition;
}

/** 根据已有状态规划 Intent 创建或幂等复用。 */
export function planIntentCreation(
  states: ReadonlyMap<ActionId, ActionJournalState>,
  intent: ActionIntentRecord,
): Result<ActionMutationPlan, HarnessError> {
  const idempotent = [...states.values()].find(
    (state) => state.intent.idempotencyKey === intent.idempotencyKey,
  );
  if (idempotent !== undefined) {
    return sameIntentIdentity(idempotent.intent, intent)
      ? success({
          state: idempotent,
          disposition: ActionJournalMutationDisposition.IdempotentReuse,
        })
      : failure(actionConflict(intent.actionId, "Action 幂等键已绑定不同 Intent。"));
  }
  if (states.has(intent.actionId)) {
    return failure(actionConflict(intent.actionId, "Action ID 已存在。"));
  }
  return success({
    state: {
      intent,
      observations: [],
      resolutions: [],
      lastSequence: 1,
      status: ActionJournalStatus.IntentRecorded,
    },
    record: intent,
    disposition: ActionJournalMutationDisposition.Appended,
  });
}

/** 规划 Observation 追加或精确幂等复用。 */
export function planObservationAppend(
  records: readonly ActionJournalRecord[],
  states: ReadonlyMap<ActionId, ActionJournalState>,
  record: ActionObservationRecord,
): Result<ActionMutationPlan, HarnessError> {
  return planRecordAppend(records, states, record, appendActionObservation);
}

/** 规划 Resolution 追加或精确幂等复用。 */
export function planResolutionAppend(
  records: readonly ActionJournalRecord[],
  states: ReadonlyMap<ActionId, ActionJournalState>,
  record: ActionResolutionRecord,
): Result<ActionMutationPlan, HarnessError> {
  return planRecordAppend(records, states, record, appendActionResolution);
}

/** 创建稳定的 Action Not Found 错误。 */
export function actionNotFound(actionId: ActionId): HarnessError {
  return new HarnessError(HarnessErrorCode.ActionNotFound, "Action Journal 不存在。", {
    actionId,
  });
}

function planRecordAppend<TRecord extends ActionObservationRecord | ActionResolutionRecord>(
  records: readonly ActionJournalRecord[],
  states: ReadonlyMap<ActionId, ActionJournalState>,
  record: TRecord,
  reduce: (state: ActionJournalState, value: TRecord) => Result<ActionJournalState, HarnessError>,
): Result<ActionMutationPlan, HarnessError> {
  const existing = records.find(
    (candidate) => candidate.actionId === record.actionId && candidate.sequence === record.sequence,
  );
  const current = states.get(record.actionId);
  if (existing !== undefined) {
    return current !== undefined && JSON.stringify(existing) === JSON.stringify(record)
      ? success({
          state: current,
          disposition: ActionJournalMutationDisposition.IdempotentReuse,
        })
      : failure(actionConflict(record.actionId, "Action Record Sequence 已绑定不同内容。"));
  }
  if (current === undefined) {
    return failure(actionNotFound(record.actionId));
  }
  const reduced = reduce(current, record);
  return reduced.status === ResultStatus.Failure
    ? reduced
    : success({
        state: reduced.value,
        record,
        disposition: ActionJournalMutationDisposition.Appended,
      });
}

function sameIntentIdentity(left: ActionIntentRecord, right: ActionIntentRecord): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.taskId === right.taskId &&
    left.commandId === right.commandId &&
    left.idempotencyKey === right.idempotencyKey &&
    left.kind === right.kind &&
    left.target === right.target &&
    left.inputDigest === right.inputDigest &&
    left.postconditionDigest === right.postconditionDigest &&
    left.baseRevision === right.baseRevision
  );
}

function actionConflict(actionId: ActionId, message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.ActionConflict, message, { actionId });
}
