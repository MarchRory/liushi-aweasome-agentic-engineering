import type { CommandEnvelope } from "#application/command/index.js";
import type { ContentDigestPort, GitCheckpointInput } from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionKind,
  type ActionIntentRecord,
} from "#domain/actionJournal/index.js";
import type { CodingTaskAggregate } from "#domain/codingTask/index.js";

import type { ValidatedSubmitImplementationPayload } from "../validation/index.js";

/** 构造 Git Checkpoint Action 的确定性 Intent。 */
export function createImplementationSubmissionIntent(
  digest: ContentDigestPort,
  command: CommandEnvelope,
  payload: ValidatedSubmitImplementationPayload,
  aggregate: CodingTaskAggregate,
): Result<ActionIntentRecord, HarnessError> {
  const postconditionDigest = digest.calculate({
    repositoryId: aggregate.repositoryId,
    worktreeId: aggregate.worktreeBinding.worktreeId,
    baseRevision: aggregate.baseRevision,
    writeSet: aggregate.writeSet,
    attemptNumber: payload.attemptNumber,
  });
  if (postconditionDigest.status === ResultStatus.Failure) return postconditionDigest;
  return success({
    schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
    recordType: ActionJournalRecordType.Intent,
    actionId: payload.actionId,
    sequence: 1,
    workspaceId: aggregate.workspaceId,
    taskId: aggregate.sourceTaskId,
    commandId: command.commandId,
    correlationId: command.correlationId,
    ...(command.causationId === undefined ? {} : { causationId: command.causationId }),
    idempotencyKey: command.idempotencyKey,
    kind: ActionKind.GitMutation,
    target: JSON.stringify({
      repositoryId: aggregate.repositoryId,
      worktreeId: aggregate.worktreeBinding.worktreeId,
      branchName: aggregate.worktreeBinding.branchName,
    }),
    inputDigest: command.requestDigest,
    postconditionDigest: postconditionDigest.value,
    baseRevision: aggregate.baseRevision,
    recoveryGuidance: "检查 Git HEAD、工作区状态和 Action Journal 后，由 Human 决定接纳或恢复。",
    actor: command.actor,
    recordedAt: command.submittedAt,
  });
}

/** 从可信 Repository Root 与 CodingTask 绑定构造 Checkpoint 输入。 */
export function createImplementationCheckpointInput(
  repositoryRoot: string,
  aggregate: CodingTaskAggregate,
  attemptNumber: number,
): GitCheckpointInput {
  return {
    repositoryId: aggregate.repositoryId,
    repositoryRoot,
    worktreeBinding: aggregate.worktreeBinding,
    baseRevision: aggregate.baseRevision,
    writeSet: aggregate.writeSet,
    commitMessage: `harness: submit ${aggregate.codingTaskId} attempt ${attemptNumber}`,
  };
}
