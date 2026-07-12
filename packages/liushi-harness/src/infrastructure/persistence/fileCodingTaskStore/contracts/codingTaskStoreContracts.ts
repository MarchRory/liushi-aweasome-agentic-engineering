import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";
/** FileCodingTaskRepository 使用的文件锁和父目录 durability 依赖。 */
export interface FileCodingTaskRepositoryOptions {
  /** CodingTask 级别的跨进程排他锁。 */
  lockManager: FileLockManager;
  /** Event 文件落盘后的父目录 durability。 */
  parentDirectoryDurability: ParentDirectoryDurability;
}
