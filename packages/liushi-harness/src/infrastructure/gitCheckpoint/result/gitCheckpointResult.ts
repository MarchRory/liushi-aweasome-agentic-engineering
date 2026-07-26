import type { GitCheckpoint, GitCheckpointExecutionResult } from "#application/ports/index.js";
import { HarnessError, HarnessErrorCode, failure, type Result } from "#common/index.js";
import { ActionOutcome } from "#domain/actionJournal/index.js";

/** 创建已证明成功的 Git Checkpoint Action 结果。 */
export function createSucceededGitCheckpointResult(
  checkpoint: GitCheckpoint,
): GitCheckpointExecutionResult {
  return {
    outcome: ActionOutcome.Succeeded,
    evidenceIds: [
      `git:${checkpoint.targetRevision}`,
      ...checkpoint.changedPaths.map((path) => `file:${path}`),
    ],
    outputDigest: checkpoint.checkpointDigest,
  };
}

/** 创建已证明未应用的 Git Checkpoint Action 结果。 */
export function createNotAppliedGitCheckpointResult(
  errorCode: string,
): GitCheckpointExecutionResult {
  return { outcome: ActionOutcome.NotApplied, evidenceIds: [], errorCode };
}

/** 创建副作用结果无法证明的 Git Checkpoint Action 结果。 */
export function createUnknownGitCheckpointResult(errorCode: string): GitCheckpointExecutionResult {
  return { outcome: ActionOutcome.OutcomeUnknown, evidenceIds: [], errorCode };
}

/** 创建不满足 Git Checkpoint 后置条件的关闭式结果。 */
export function gitCheckpointUnavailable(): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.InvalidStateTransition, "Git Checkpoint 后置条件不满足。"),
  );
}
