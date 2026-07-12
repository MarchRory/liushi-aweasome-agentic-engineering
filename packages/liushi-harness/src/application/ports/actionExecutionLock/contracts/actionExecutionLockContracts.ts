import type { HarnessError, Result } from "#common/index.js";
import type { ActionId } from "#domain/actionJournal/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** 定位一个需要串行执行的 Action。 */
export interface ActionExecutionLockRequest {
  /** Action 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Action 所属 Task。 */
  readonly taskId: TaskId;
  /** 被串行化的 Action。 */
  readonly actionId: ActionId;
}

/** Action 执行锁的释放句柄。 */
export interface ActionExecutionLockHandle {
  /** 释放执行锁；重复调用返回第一次释放结果。 */
  release(): Promise<Result<void, HarnessError>>;
}

/** 防止同一 Action 被多个进程同时执行的 Port。 */
export interface ActionExecutionLockPort {
  /** 获取 Action 级排他执行锁。 */
  acquire(
    input: ActionExecutionLockRequest,
  ): Promise<Result<ActionExecutionLockHandle, HarnessError>>;
}
