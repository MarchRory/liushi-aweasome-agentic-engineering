import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

import type { PilotMetricsDigestPort } from "#domain/pilotMetrics/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** File Pilot Metrics Store 的依赖。 */
export interface FilePilotMetricsStoreDependencies {
  /** 计算和校验记录摘要的端口。 */
  readonly digest: PilotMetricsDigestPort;
  /** 串行化同一会话文件操作的锁管理器。 */
  readonly lockManager: FileLockManager;
  /** 确保持久化目录元数据落盘的能力。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}

/** Pilot Metrics 两份记录文件及其受保护目录。 */
export interface FilePilotMetricsStorePaths {
  /** Pilot Metrics 持久化根目录。 */
  readonly storeRoot: string;
  /** 路径所属的工作区标识。 */
  readonly workspaceId: WorkspaceId;
  /** 路径所属的编码任务会话标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** 当前工作区的持久化目录。 */
  readonly workspaceDirectory: string;
  /** 当前会话的持久化目录。 */
  readonly sessionDirectory: string;
  /** Enrollment 记录文件路径。 */
  readonly enrollmentFile: string;
  /** Settlement 记录文件路径。 */
  readonly settlementFile: string;
  /** 保护当前会话记录的锁文件路径。 */
  readonly lockFile: string;
}
