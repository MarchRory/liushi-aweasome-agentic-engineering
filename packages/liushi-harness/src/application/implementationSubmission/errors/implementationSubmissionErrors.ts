import { HarnessError, HarnessErrorCode } from "#common/index.js";
import type { ActionJournalStatus } from "#domain/actionJournal/index.js";

/** 构造必须由 Human 检查 Git 与 Journal 的未知结果错误。 */
export function implementationSubmissionWaitingHuman(
  actionId: string,
  status: ActionJournalStatus,
  cause?: HarnessError,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
    "Git Checkpoint 结果需要 Human 恢复检查。",
    { actionId, status },
    cause,
  );
}

/** 构造 Git 已提交但领域事件尚未可靠闭合的未知结果错误。 */
export function implementationCheckpointClosureUnknown(
  actionId: string,
  cause: HarnessError,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
    "Git Checkpoint 已提交，但 CodingTask 收口结果无法确认，需要 Human 恢复检查。",
    { actionId },
    cause,
  );
}
