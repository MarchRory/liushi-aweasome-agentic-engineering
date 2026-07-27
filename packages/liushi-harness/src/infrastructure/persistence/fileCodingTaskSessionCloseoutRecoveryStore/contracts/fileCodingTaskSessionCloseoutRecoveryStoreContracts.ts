import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** File Recovery Store 的可替换基础设施依赖。 */
export interface FileCodingTaskSessionCloseoutRecoveryStoreDependencies {
  /** 用于校验嵌套 Checkpoint 摘要的 Port。 */
  readonly digest: ContentDigestPort;
  /** 提供跨进程短时排他锁。 */
  readonly lockManager: FileLockManager;
  /** 负责原子写入后的父目录耐久化。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}

/** 由已验证 Workspace/Session 标识推导出的 Recovery 文件路径集合。 */
export interface CodingTaskSessionCloseoutRecoveryStorePaths {
  /** Store Root 下的 Workspace 目录。 */
  readonly workspaceDirectory: string;
  /** Session State 所在目录。 */
  readonly sessionDirectory: string;
  /** Recovery Process State 文件。 */
  readonly stateFile: string;
  /** Recovery Store 独立短时锁文件。 */
  readonly lockFile: string;
  /** 锁上下文中的 Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 锁上下文中的 Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
}
