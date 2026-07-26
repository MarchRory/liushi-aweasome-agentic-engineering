import type {
  ParentDirectoryDurability,
  FileLockManager,
} from "#infrastructure/persistence/fileEventStore/index.js";
import type { CodingTaskSessionAdmissionState } from "#domain/codingTaskSession/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** File Admission State Adapter 的可替换基础设施依赖。 */
export interface FileCodingTaskSessionAdmissionStateStoreDependencies {
  /** 原子写入后的父目录耐久化策略。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}

/** File Admission Lease Adapter 的可替换基础设施依赖。 */
export interface FileCodingTaskSessionAdmissionLeaseDependencies {
  /** 提供跨进程排他锁的管理器。 */
  readonly lockManager: FileLockManager;
}

/** 由已校验 Workspace/Session 标识推导的 Admission 文件路径。 */
export interface CodingTaskSessionAdmissionStorePaths {
  /** Workspace 目录。 */
  readonly workspaceDirectory: string;
  /** Session 目录。 */
  readonly sessionDirectory: string;
  /** admission.json 文件。 */
  readonly stateFile: string;
  /** .admission.lock 文件。 */
  readonly lockFile: string;
  /** 仅用于锁上下文的 Workspace ID。 */
  readonly workspaceId: WorkspaceId;
  /** 仅用于锁上下文的 Session ID。 */
  readonly sessionId: CodingTaskSessionId;
}

/** File Adapter 的持久化候选状态与路径绑定。 */
export interface CodingTaskSessionAdmissionStateRecord {
  /** 候选状态。 */
  readonly state: CodingTaskSessionAdmissionState;
  /** 已校验的存储路径。 */
  readonly paths: CodingTaskSessionAdmissionStorePaths;
}
