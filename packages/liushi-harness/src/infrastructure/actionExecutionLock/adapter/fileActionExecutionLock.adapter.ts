import type {
  ActionExecutionLockHandle,
  ActionExecutionLockPort,
  ActionExecutionLockRequest,
} from "#application/ports/index.js";
import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import type { FileLockManager } from "#infrastructure/persistence/fileEventStore/lock/index.js";

import { resolveActionExecutionLockPath } from "../path/index.js";

/** 使用 Runtime Store 文件锁串行化同一 Action 的执行。 */
export class FileActionExecutionLockAdapter implements ActionExecutionLockPort {
  public constructor(
    private readonly storeRoot: string,
    private readonly lockManager: FileLockManager,
  ) {}

  /** 获取锁失败时不向 Application 泄露本机文件路径。 */
  public async acquire(
    input: ActionExecutionLockRequest,
  ): Promise<Result<ActionExecutionLockHandle, HarnessError>> {
    let fileLock;
    try {
      fileLock = await this.lockManager.acquire(
        resolveActionExecutionLockPath(this.storeRoot, input),
        { workspaceId: input.workspaceId, taskId: input.taskId },
      );
    } catch (error) {
      return failure(mapAcquireError(input, error));
    }

    let releaseResult: Result<void, HarnessError> | undefined;
    return success({
      async release(): Promise<Result<void, HarnessError>> {
        if (releaseResult !== undefined) return releaseResult;
        try {
          await fileLock.release();
          releaseResult = success(undefined);
        } catch (error) {
          releaseResult = failure(
            new HarnessError(
              HarnessErrorCode.ActionExecutionLockReleaseUnknown,
              "Action execution lock release outcome is unknown.",
              scopeDetails(input),
              error,
            ),
          );
        }
        return releaseResult;
      },
    });
  }
}

function mapAcquireError(input: ActionExecutionLockRequest, error: unknown): HarnessError {
  if (error instanceof HarnessError && error.code === HarnessErrorCode.LockUnavailable) {
    return new HarnessError(
      HarnessErrorCode.LockUnavailable,
      "Action is already executing in another process.",
      scopeDetails(input),
      error,
    );
  }
  return new HarnessError(
    HarnessErrorCode.IoFailure,
    "Unable to acquire Action execution lock.",
    scopeDetails(input),
    error,
  );
}

function scopeDetails(input: ActionExecutionLockRequest): Readonly<Record<string, string>> {
  return {
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    actionId: input.actionId,
  };
}
