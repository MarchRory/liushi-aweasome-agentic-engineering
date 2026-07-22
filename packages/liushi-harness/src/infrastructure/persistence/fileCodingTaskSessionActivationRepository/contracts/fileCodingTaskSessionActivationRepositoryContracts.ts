import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

/** File Repository 的可替换运行时依赖。 */
export interface FileCodingTaskSessionActivationRepositoryDependencies {
  /** 对 Activation 规范字段计算 Binding Digest。 */
  readonly digest: ContentDigestPort;
  /** 跨进程 create/load 锁。 */
  readonly lockManager: FileLockManager;
  /** 原子发布后的父目录 durability。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}

/** 从已校验标识符推导的文件路径集合。 */
export interface CodingTaskSessionActivationStorePaths {
  /** Workspace 目录。 */
  readonly workspaceDirectory: string;
  /** Session 目录。 */
  readonly sessionDirectory: string;
  /** Activation JSON 文件。 */
  readonly recordFile: string;
  /** Session 级跨进程锁文件。 */
  readonly lockFile: string;
  /** 仅用于锁上下文的 Workspace ID。 */
  readonly workspaceId: WorkspaceId;
  /** 仅用于锁上下文的 Session ID。 */
  readonly sessionId: CodingTaskSessionId;
}
