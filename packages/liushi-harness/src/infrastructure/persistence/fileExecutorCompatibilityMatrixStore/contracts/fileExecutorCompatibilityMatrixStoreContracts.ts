import type { ExecutorCompatibilityDigestPort } from "#domain/executorCompatibility/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

/** File Executor Compatibility Matrix Store 的可注入依赖。 */
export interface FileExecutorCompatibilityMatrixStoreDependencies {
  /** 跨进程排他文件锁。 */
  readonly lockManager: FileLockManager;
  /** 原子替换后的父目录耐久性边界。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
  /** RFC 8785 SHA-256 摘要计算端口。 */
  readonly digest: ExecutorCompatibilityDigestPort;
}
