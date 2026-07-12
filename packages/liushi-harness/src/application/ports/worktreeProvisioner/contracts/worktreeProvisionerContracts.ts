import type { ActionExecutorPort } from "#application/actionExecution/contracts/index.js";
import type { WorktreeBinding } from "#domain/codingTask/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

/** 只在 Infrastructure 调用期间存在的 Managed Worktree 创建输入。 */
export interface ProvisionWorktreeExecutionInput {
  /** 目标 Repository 的稳定标识。 */
  readonly repositoryId: RepositoryId;
  /** 本机 Repository Root；不得进入 Journal、Receipt 或 Evidence。 */
  readonly repositoryRoot: string;
  /** 已由 CodingTask 权威状态绑定的 Managed Worktree。 */
  readonly worktreeBinding: WorktreeBinding;
  /** 已由 CodingTask 锁定的 Base Revision。 */
  readonly baseRevision: string;
  /** 已由 CodingTask 声明的规范化 Write Set。 */
  readonly writeSet: readonly string[];
  /** 本次 Provision 结果对应的稳定 Evidence ID。 */
  readonly evidenceId: string;
}

/** 创建 Managed Git Worktree 的 Executor Port。 */
export type WorktreeProvisionerPort = ActionExecutorPort<ProvisionWorktreeExecutionInput>;
