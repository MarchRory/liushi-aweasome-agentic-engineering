import { HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";
import {
  ActionJournalRecordType,
  appendActionObservation,
  appendActionResolution,
  createActionJournalState,
  type ActionId,
  type ActionJournalRecord,
  type ActionJournalState,
} from "#domain/actionJournal/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** 按文件顺序重放 Task 内全部 Action Journal。 */
export function replayActionJournals(
  records: readonly ActionJournalRecord[],
  workspaceId: WorkspaceId,
  taskId: TaskId,
): ReadonlyMap<ActionId, ActionJournalState> {
  const states = new Map<ActionId, ActionJournalState>();
  for (const record of records) {
    if (record.recordType === ActionJournalRecordType.Intent) {
      if (
        record.workspaceId !== workspaceId ||
        record.taskId !== taskId ||
        states.has(record.actionId)
      ) {
        throw corruptReplay(record.actionId, "Action Intent 所属范围或唯一性无效。");
      }
      states.set(record.actionId, createActionJournalState(record));
      continue;
    }

    const current = states.get(record.actionId);
    if (current === undefined) {
      throw corruptReplay(record.actionId, "Action Record 出现在对应 Intent 之前。");
    }
    const reduced =
      record.recordType === ActionJournalRecordType.Observation
        ? appendActionObservation(current, record)
        : appendActionResolution(current, record);
    if (reduced.status === ResultStatus.Failure) {
      throw corruptReplay(record.actionId, "Action Journal 状态序列无效。", reduced.error);
    }
    states.set(record.actionId, reduced.value);
  }
  return states;
}

function corruptReplay(actionId: ActionId, message: string, cause?: unknown): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message, { actionId }, cause);
}
