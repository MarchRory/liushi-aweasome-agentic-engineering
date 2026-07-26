import type { ParentDirectorySyncStatus } from "#application/index.js";

/** 父目录 fsync 的 Adapter 输出。 */
export interface ParentDirectorySyncOutcome {
  /** 当前路径父目录的实际刷新结果。 */
  status: ParentDirectorySyncStatus;
  /** 未直接完成目录 fsync 时用于诊断的平台或文件系统原因。 */
  reason?: string;
}

/** 负责在文件创建或 atomic rename 后刷新父目录。 */
export interface ParentDirectoryDurability {
  /** 尝试 fsync 目标文件的父目录，并返回精确耐久性状态。 */
  syncParentDirectory(filePath: string): Promise<ParentDirectorySyncOutcome>;
}
