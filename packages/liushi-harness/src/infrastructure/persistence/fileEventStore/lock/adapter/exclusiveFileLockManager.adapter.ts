import type {
  ExclusiveFileLockHandle,
  FileLockManager,
  TaskLockContext,
} from "../contracts/index.js";
import { acquireExclusiveFileLock } from "../io/index.js";

/** 基于 `wx` 创建语义的跨进程 File Lock Adapter。 */
export class ExclusiveFileLockManager implements FileLockManager {
  /** 获取排他 Lock。 */
  public async acquire(
    lockFile: string,
    context: TaskLockContext,
  ): Promise<ExclusiveFileLockHandle> {
    return acquireExclusiveFileLock(lockFile, context);
  }
}
