import type { FileLockManager } from "#infrastructure/persistence/fileEventStore/index.js";

/** File Trace Store 的可替换基础设施依赖。 */
export interface FileTraceStoreDependencies {
  /** Trace JSONL 跨进程写入 Lock。 */
  readonly lockManager: FileLockManager;
}
