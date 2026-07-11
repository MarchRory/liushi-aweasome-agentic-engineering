import type { ExclusiveFileLockHandle } from "../lock/index.js";

/** Event 提交前需要释放的可选 Lock 集合。 */
export interface PreCommitLocks {
  /** 已获取的 Task Lock。 */
  task?: ExclusiveFileLockHandle;
  /** 已获取的 Workspace task-creation Lock。 */
  workspace?: ExclusiveFileLockHandle;
}
