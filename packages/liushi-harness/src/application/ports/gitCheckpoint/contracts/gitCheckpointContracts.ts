import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { ActionOutcome } from "#domain/actionJournal/index.js";
import type { WorktreeBinding } from "#domain/codingTask/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

/** 创建或检查实现 Checkpoint 所需的权威输入。 */
export interface GitCheckpointInput {
  /** Repository 稳定标识。 */
  readonly repositoryId: RepositoryId;
  /** 仅在当前调用使用的 Repository Root。 */
  readonly repositoryRoot: string;
  /** 已绑定的 Managed Worktree。 */
  readonly worktreeBinding: WorktreeBinding;
  /** 当前 Attempt 开始时锁定的基础版本。 */
  readonly baseRevision: string;
  /** Human 已确认的完整写入范围。 */
  readonly writeSet: readonly string[];
  /** 不包含用户输入和 Secret 的提交信息。 */
  readonly commitMessage: string;
}

/** 已提交实现 Checkpoint 的确定性投影。 */
export interface GitCheckpoint {
  /** 新提交的目标版本。 */
  readonly targetRevision: string;
  /** Base 与 Target 之间按路径排序的变更集合。 */
  readonly changedPaths: readonly string[];
  /** Target Revision 与 Changed Paths 的联合摘要。 */
  readonly checkpointDigest: ContentDigest;
}

/** Git Checkpoint Action 可写入 Journal 的封闭结果。 */
export interface GitCheckpointExecutionResult {
  /** 当前证据支持的副作用结果。 */
  readonly outcome: ActionOutcome;
  /** 支撑结果的稳定证据标识。 */
  readonly evidenceIds: readonly string[];
  /** 成功时的 Checkpoint 摘要。 */
  readonly outputDigest?: ContentDigest;
  /** 非成功结果的稳定分类。 */
  readonly errorCode?: string;
}

/** 创建并恢复检查单提交实现 Checkpoint 的 Port。 */
export interface GitCheckpointPort {
  /** 从洁净基线上的 Write Set Diff 创建一个本地 Commit。 */
  execute(input: GitCheckpointInput): Promise<Result<GitCheckpointExecutionResult, HarnessError>>;
  /** 不产生副作用地检查 Base 到当前 HEAD 是否构成合法 Checkpoint。 */
  inspect(input: GitCheckpointInput): Promise<Result<GitCheckpoint, HarnessError>>;
}
