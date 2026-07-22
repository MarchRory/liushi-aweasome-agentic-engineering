import type { FileLockManager } from "#infrastructure/persistence/fileEventStore/index.js";

/** File Session Activation Lease Adapter 的基础设施依赖。 */
export interface FileCodingTaskSessionActivationLeaseDependencies {
  /** 提供跨进程独占锁的管理器。 */
  readonly lockManager: FileLockManager;
}

/** 已解析的 Session Activation Lease 文件路径。 */
export interface CodingTaskSessionActivationLeasePath {
  /** Workspace 目录路径。 */
  readonly workspaceDirectory: string;
  /** Session 目录路径。 */
  readonly sessionDirectory: string;
  /** Lease 锁文件路径。 */
  readonly lockFile: string;
  /** 用于锁上下文的 Workspace 标识。 */
  readonly workspaceId: string;
  /** 用于锁上下文的 Session 标识。 */
  readonly sessionId: string;
}
