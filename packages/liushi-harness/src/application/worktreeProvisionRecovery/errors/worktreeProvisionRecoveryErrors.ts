import { HarnessError, HarnessErrorCode } from "#common/index.js";

import type { WorktreeProvisionRecoveryJournalPhase } from "../enums/index.js";

/** 创建恢复评估与 Human 已确认摘要不一致的版本冲突。 */
export function worktreeProvisionRecoveryAssessmentConflict(
  expectedDigest: string,
  actualDigest: string,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.VersionConflict,
    "Worktree Provision 恢复现场已变化，必须重新评估并由 Human 再次确认。",
    { expectedDigest, actualDigest },
  );
}

/** 创建 Action Journal 无法确定完成写入的恢复错误。 */
export function worktreeProvisionRecoveryJournalUnknown(
  actionId: string,
  phase: WorktreeProvisionRecoveryJournalPhase,
  cause: HarnessError,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
    "Worktree Provision 恢复记录无法可靠闭合，禁止自动重试。",
    { actionId, phase },
    cause,
  );
}
