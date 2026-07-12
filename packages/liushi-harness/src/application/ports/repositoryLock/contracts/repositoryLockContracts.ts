import type { HarnessError, Result } from "#common/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

/** Application 请求获取一个 Repository 级互斥 Lock 的输入。 */
export interface AcquireRepositoryLockInput {
  /** Lock 所属 Workspace 的外部字符串。 */
  workspaceId: string;
  /** 目标 Repository 的外部字符串。 */
  repositoryId: string;
  /** 持有 Lock 的 CodingTask、Workflow 或其他运行实例标识。 */
  holderId: string;
}

/** 已完成边界校验、供 Infrastructure 获取 Lock 的请求。 */
export interface RepositoryLockRequest {
  /** Lock 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 被串行化的 Repository。 */
  repositoryId: RepositoryId;
  /** 持有 Lock 的稳定运行实例标识。 */
  holderId: string;
}

/** Repository Lock 的生命周期句柄。 */
export interface RepositoryLockHandle {
  /** Harness 生成的 Lock 运行标识。 */
  lockId: string;
  /** Lock 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 被串行化的 Repository。 */
  repositoryId: RepositoryId;
  /** 获取 Lock 的时间。 */
  acquiredAt: string;
  /** 释放 Lock；重复调用不会再次执行释放副作用。 */
  release(): Promise<Result<void, HarnessError>>;
}

/** Repository 生命周期、受控写入和真实 Executor 复用的互斥边界。 */
export interface RepositoryLockPort {
  /** 获取一个 Repository 级排他 Lock，不执行 Worktree 创建或代码写入。 */
  acquire(input: RepositoryLockRequest): Promise<Result<RepositoryLockHandle, HarnessError>>;
}
