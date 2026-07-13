import type { ActionJournalRepository, ContentDigestPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { ActionJournalStatus, type ActionId } from "#domain/actionJournal/index.js";
import type { CodingTaskAggregate } from "#domain/codingTask/index.js";

import { WorktreeProvisionIntentMatch, WorktreeProvisionIntentMatcher } from "../identity/index.js";

/** 阻止未闭合 Worktree Provision 被下游命令旁路。 */
export class UnresolvedWorktreeProvisionGuard {
  private readonly matcher: WorktreeProvisionIntentMatcher;

  public constructor(
    private readonly repository: ActionJournalRepository,
    digest: ContentDigestPort,
  ) {
    this.matcher = new WorktreeProvisionIntentMatcher(digest);
  }

  /** 在仓库锁内确认当前 CodingTask 不存在会阻断命令的 Provision Action。 */
  public async check(
    aggregate: CodingTaskAggregate,
    currentProvisionActionId?: ActionId,
  ): Promise<Result<void, HarnessError>> {
    let listed: Awaited<ReturnType<ActionJournalRepository["listRecoverable"]>>;
    try {
      listed = await this.repository.listRecoverable({
        workspaceId: aggregate.workspaceId,
        taskId: aggregate.sourceTaskId,
      });
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "读取可恢复 Action Journal 失败，Worktree Provision Guard 已拒绝放行。",
          { codingTaskId: aggregate.codingTaskId },
          error,
        ),
      );
    }
    if (listed.status === ResultStatus.Failure) return listed;

    for (const state of listed.value) {
      const matched = this.matcher.match(aggregate, state.intent);
      if (matched.status === ResultStatus.Failure) return matched;
      if (matched.value === WorktreeProvisionIntentMatch.Unrelated) continue;

      switch (state.status) {
        case ActionJournalStatus.Committed:
        case ActionJournalStatus.Recovered:
          continue;
        case ActionJournalStatus.RetryPermitted:
          if (state.intent.actionId === currentProvisionActionId) continue;
          break;
        case ActionJournalStatus.IntentRecorded:
        case ActionJournalStatus.AwaitingResolution:
        case ActionJournalStatus.WaitingHuman:
          break;
      }
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "存在尚未闭合的 Worktree Provision Action。",
          { actionId: state.intent.actionId, status: state.status },
        ),
      );
    }
    return success(undefined);
  }
}
