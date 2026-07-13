import type { ContentDigest } from "#common/index.js";

/** 实现收口 Command 的持久化载荷。 */
export interface SubmitImplementationCommandPayload {
  /** CodingTask 所属 Workspace。 */
  readonly workspaceId: string;
  /** Git Checkpoint 对应的 Action 标识。 */
  readonly actionId: string;
  /** 当前仍在运行的 Attempt 序号。 */
  readonly attemptNumber: number;
  /** Repository Root 明文的摘要绑定。 */
  readonly repositoryRootDigest: ContentDigest;
}

/** 仅在当前调用期间存在的本机 Repository Root。 */
export interface ImplementationSubmissionRuntimeContext {
  /** 包含 Managed Worktree 的本机 Repository Root。 */
  readonly repositoryRoot: string;
}
