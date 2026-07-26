import type { HarnessError, Result } from "#common/index.js";
import type { WorktreeBinding } from "#domain/codingTask/index.js";
import type { CodingTaskSessionChangeSet } from "#domain/codingTaskSessionChangeSet/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

/** 从已提交 Revision Range 重建 ChangeSet 的权威输入。 */
export interface InspectCommittedGitChangeSetInput {
  /** Repository 的稳定标识。 */
  readonly repositoryId: RepositoryId;
  /** 仅供本次运行使用的本机 Repository Root。 */
  readonly repositoryRoot: string;
  /** 已提交 Checkpoint 所属的受管 Worktree。 */
  readonly worktreeBinding: WorktreeBinding;
  /** ChangeSet 锁定的基础 Commit Revision。 */
  readonly baseRevision: string;
  /** 已提交 Checkpoint 的目标 Commit Revision。 */
  readonly targetRevision: string;
  /** Human 已确认的完整规范 Write Set。 */
  readonly writeSet: readonly string[];
}

/** 从真实 Commit Diff 与目标内容重建 ChangeSet 的 Port。 */
export interface GitCommittedChangeSetInspectorPort {
  /** 在调用方持有 Repository Lock 时只读重建已提交 ChangeSet。 */
  inspectCommitted(
    input: InspectCommittedGitChangeSetInput,
  ): Promise<Result<CodingTaskSessionChangeSet, HarnessError>>;
}
