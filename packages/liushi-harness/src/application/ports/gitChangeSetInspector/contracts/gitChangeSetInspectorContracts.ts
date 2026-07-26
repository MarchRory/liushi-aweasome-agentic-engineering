import type { HarnessError, Result } from "#common/index.js";
import type { CodingTaskSessionChangeSetSnapshot } from "#domain/codingTaskSessionChangeSet/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";
import type { WorktreeBinding } from "#domain/codingTask/index.js";

/** Git ChangeSet Inspector 的唯一运行时输入。 */
export interface InspectGitChangeSetInput {
  /** Repository 的稳定标识。 */
  readonly repositoryId: RepositoryId;
  /** 仅供本次运行使用的本机 Repository Root。 */
  readonly repositoryRoot: string;
  /** 期望检查的受管 Worktree 绑定。 */
  readonly worktreeBinding: WorktreeBinding;
  /** CodingTask Session 锁定的基础 Revision。 */
  readonly baseRevision: string;
  /** 已由上游声明且必须保持规范形式的 Write Set。 */
  readonly writeSet: readonly string[];
}

/** 从提交前权威 Worktree 状态构建 Git ChangeSet Snapshot 的 Port。 */
export interface GitChangeSetInspectorPort {
  /** 在调用方持有 Repository Lock 时检查 dirty Worktree；不承担提交后复验。 */
  inspectPreSubmit(
    input: InspectGitChangeSetInput,
  ): Promise<Result<CodingTaskSessionChangeSetSnapshot, HarnessError>>;
}
