import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

/** FileWorkflowRepository 所需的基础设施依赖。 */
export interface FileWorkflowRepositoryOptions {
  /** 负责 Workflow 级别跨进程互斥。 */
  readonly lockManager: FileLockManager;
  /** 负责 Event 文件落盘后的父目录持久化。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}
