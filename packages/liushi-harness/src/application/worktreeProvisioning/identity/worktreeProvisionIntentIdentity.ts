import type { ContentDigestPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { ActionKind, type ActionIntentRecord } from "#domain/actionJournal/index.js";
import type { CodingTaskAggregate } from "#domain/codingTask/index.js";
import { z } from "zod";

/** Worktree Provision Intent 的结构化匹配结果。 */
export enum WorktreeProvisionIntentMatch {
  /** Intent 与权威 CodingTask 的 Worktree Provision 身份完全一致。 */
  Matched = "matched",
  /** Intent 属于其他 Action，不参与 Provision 阻断。 */
  Unrelated = "unrelated",
}

const worktreeProvisionTargetSchema = z
  .object({
    repositoryId: z.string(),
    worktreeId: z.string(),
    relativePath: z.string(),
    branchName: z.string(),
  })
  .strict();

/** 只按权威 CodingTask 身份与规范摘要识别 Worktree Provision Intent。 */
export class WorktreeProvisionIntentMatcher {
  public constructor(private readonly digest: ContentDigestPort) {}

  /** 严格匹配一个 Action Intent 是否属于当前 CodingTask 的 Worktree Provision。 */
  public match(
    aggregate: CodingTaskAggregate,
    intent: ActionIntentRecord,
  ): Result<WorktreeProvisionIntentMatch, HarnessError> {
    if (
      intent.workspaceId !== aggregate.workspaceId ||
      intent.taskId !== aggregate.sourceTaskId ||
      intent.kind !== ActionKind.GitMutation ||
      intent.baseRevision !== aggregate.baseRevision
    ) {
      return success(WorktreeProvisionIntentMatch.Unrelated);
    }

    const target = parseTarget(intent.target);
    if (target.status === ResultStatus.Failure) return target;
    if (target.value === undefined) {
      return success(WorktreeProvisionIntentMatch.Unrelated);
    }
    if (
      target.value.repositoryId !== aggregate.repositoryId ||
      target.value.worktreeId !== aggregate.worktreeBinding.worktreeId ||
      target.value.relativePath !== aggregate.worktreeBinding.relativePath ||
      target.value.branchName !== aggregate.worktreeBinding.branchName
    ) {
      return success(WorktreeProvisionIntentMatch.Unrelated);
    }

    const postconditionDigest = this.digest.calculate({
      repositoryId: aggregate.repositoryId,
      worktreeBinding: aggregate.worktreeBinding,
      baseRevision: aggregate.baseRevision,
    });
    if (postconditionDigest.status === ResultStatus.Failure) return postconditionDigest;
    if (intent.postconditionDigest !== postconditionDigest.value) {
      return failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "Worktree Provision Action Postcondition Digest 不匹配。",
          { actionId: intent.actionId },
        ),
      );
    }
    return success(WorktreeProvisionIntentMatch.Matched);
  }
}

function parseTarget(value: string) {
  try {
    const decoded: unknown = JSON.parse(value);
    if (!declaresProvisionIdentity(decoded)) return success(undefined);
    const parsed = worktreeProvisionTargetSchema.safeParse(decoded);
    return parsed.success
      ? success(parsed.data)
      : failure(
          new HarnessError(
            HarnessErrorCode.CorruptStore,
            "Worktree Provision Action Target 结构无效。",
          ),
        );
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Worktree Provision Action Target 不是有效 JSON。",
        {},
        error,
      ),
    );
  }
}

function declaresProvisionIdentity(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return ["repositoryId", "worktreeId", "relativePath", "branchName"].every((field) =>
    Object.prototype.hasOwnProperty.call(value, field),
  );
}
