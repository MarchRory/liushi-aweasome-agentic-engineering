/** Task Lock 中用于诊断归属的稳定上下文。 */
export interface TaskLockContext {
  /** Lock 所属 Workspace。 */
  workspaceId: string;
  /** Lock 所属 Task；Workspace task-creation lock 不包含该字段。 */
  taskId?: string;
}

/** 已获得排他文件 Lock 的释放句柄。 */
export interface ExclusiveFileLockHandle {
  /** 释放 Lock；重复调用没有副作用。 */
  release(): Promise<void>;
}

/** File lock 获取与释放边界。 */
export interface FileLockManager {
  /** 获取指定路径的排他文件 Lock。 */
  acquire(lockFile: string, context: TaskLockContext): Promise<ExclusiveFileLockHandle>;
}
