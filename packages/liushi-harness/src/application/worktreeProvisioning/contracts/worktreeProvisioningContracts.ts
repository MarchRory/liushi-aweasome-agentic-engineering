import type { ContentDigest } from "#common/index.js";

/** Worktree Provision Command 的可持久化 Payload。 */
export interface ProvisionWorktreeCommandPayload {
  /** CodingTask 所属 Workspace。 */
  readonly workspaceId: string;
  /** Action Journal 使用的稳定 Action ULID。 */
  readonly actionId: string;
  /** 本机 Repository Root 的摘要，不包含绝对路径明文。 */
  readonly repositoryRootDigest: ContentDigest;
}

/** 只在当前进程调用期间存在的 Worktree Provision Runtime Context。 */
export interface ProvisionWorktreeRuntimeContext {
  /** 本机 Repository Root，不得持久化。 */
  readonly repositoryRoot: string;
}
