import type {
  RepositoryLockHandle,
  RepositoryLockPort,
  RepositoryLockRequest,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  failure,
  success,
  type Clock,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import type { FileLockManager } from "#infrastructure/persistence/fileEventStore/lock/index.js";

import { resolveRepositoryLockPath } from "../path/index.js";

/** 使用 Runtime Store 文件锁实现 Repository 级排他 Lock。 */
export class NodeRepositoryLockAdapter implements RepositoryLockPort {
  public constructor(
    private readonly storeRoot: string,
    private readonly lockManager: FileLockManager,
    private readonly clock: Clock,
    private readonly lockIdGenerator: IdGenerator,
  ) {}

  /** 获取锁失败时只返回稳定 Repository 信息，不泄露本机 Lock 文件路径。 */
  public async acquire(
    input: RepositoryLockRequest,
  ): Promise<Result<RepositoryLockHandle, HarnessError>> {
    const lockPath = resolveRepositoryLockPath(
      this.storeRoot,
      input.workspaceId,
      input.repositoryId,
    );
    let fileLock;
    try {
      fileLock = await this.lockManager.acquire(lockPath, {
        workspaceId: input.workspaceId,
        taskId: input.holderId,
      });
    } catch (error) {
      return failure(mapAcquireError(input, error));
    }

    const lockId = this.lockIdGenerator.next();
    const acquiredAt = this.clock.now().toISOString();
    let released = false;
    return success({
      lockId,
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
      acquiredAt,
      async release(): Promise<Result<void, HarnessError>> {
        if (released) return success(undefined);
        try {
          await fileLock.release();
          released = true;
          return success(undefined);
        } catch (error) {
          return failure(
            new HarnessError(
              HarnessErrorCode.IoFailure,
              "Repository Lock release outcome is unknown.",
              {
                workspaceId: input.workspaceId,
                repositoryId: input.repositoryId,
                lockId,
              },
              error,
            ),
          );
        }
      },
    });
  }
}

function mapAcquireError(input: RepositoryLockRequest, error: unknown): HarnessError {
  if (error instanceof HarnessError && error.code === HarnessErrorCode.LockUnavailable) {
    return new HarnessError(
      HarnessErrorCode.LockUnavailable,
      "Repository is already locked by another operation.",
      {
        workspaceId: input.workspaceId,
        repositoryId: input.repositoryId,
      },
      error,
    );
  }
  return new HarnessError(
    HarnessErrorCode.IoFailure,
    "Unable to acquire Repository Lock.",
    {
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
    },
    error,
  );
}
