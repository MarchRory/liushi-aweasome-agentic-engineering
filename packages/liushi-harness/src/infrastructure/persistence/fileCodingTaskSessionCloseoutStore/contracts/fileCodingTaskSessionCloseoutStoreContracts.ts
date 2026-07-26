import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** File Closeout Store 的可替换基础设施依赖。 */
export interface FileCodingTaskSessionCloseoutStoreDependencies {
  /** 验证 Snapshot、Checkpoint 与 Action Evidence 摘要的 Port。 */
  readonly digest: ContentDigestPort;
  /** 提供跨进程短时 ExclusiveFileLock 的管理器。 */
  readonly lockManager: FileLockManager;
  /** 负责 atomic write 后的父目录耐久化。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}

/** 由已验证 Workspace/Session 标识推导的文件路径集合。 */
export interface CodingTaskSessionCloseoutStorePaths {
  /** Store Root 下的 Workspace 目录。 */
  readonly workspaceDirectory: string;
  /** Session State 目录。 */
  readonly sessionDirectory: string;
  /** Closeout State 文件。 */
  readonly stateFile: string;
  /** create/replace 共用的短时锁文件。 */
  readonly lockFile: string;
  /** 锁上下文中的 Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 锁上下文中的 Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
}
