import type { ParentDirectorySyncStatus } from "#application/index.js";

/** 父目录 fsync 的 Adapter 输出。 */
export interface ParentDirectorySyncOutcome {
  /** 当前路径父目录的实际刷新结果。 */
  status: ParentDirectorySyncStatus;
  /** best-effort 时用于诊断的平台或文件系统原因。 */
  reason?: string;
}

/** 负责在文件创建或 atomic rename 后刷新父目录。 */
export interface ParentDirectoryDurability {
  /** 尝试 fsync 目标文件的父目录，Unsupported 平台返回 best-effort。 */
  syncParentDirectory(filePath: string): Promise<ParentDirectorySyncOutcome>;
}
