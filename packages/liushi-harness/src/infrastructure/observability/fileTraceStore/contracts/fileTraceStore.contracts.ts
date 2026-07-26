import type { FileLockManager } from "#infrastructure/persistence/fileEventStore/index.js";

/** File Trace Store 的可替换基础设施依赖。 */
export interface FileTraceStoreDependencies {
  /** Trace JSONL 跨进程写入 Lock。 */
  readonly lockManager: FileLockManager;
  /** 平台文件访问探针；默认使用 Task Store 的真实路径检查。 */
  readonly pathExists?: (path: string) => Promise<boolean>;
}
