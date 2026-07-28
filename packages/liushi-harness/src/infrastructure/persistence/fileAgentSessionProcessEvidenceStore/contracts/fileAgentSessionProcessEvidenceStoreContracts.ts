import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

/** File Agent 进程证据 Store 的可替换运行时依赖。 */
export interface FileAgentSessionProcessEvidenceStoreDependencies {
  /** 复验进程证据摘要的内容摘要端口。 */
  readonly digest: ContentDigestPort;
  /** 协调同一 Session create/load 的跨进程文件锁。 */
  readonly lockManager: FileLockManager;
  /** 原子发布后的父目录耐久化端口。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}

/** 从已校验标识符推导的进程证据文件路径集合。 */
export interface AgentSessionProcessEvidenceStorePaths {
  /** Workspace 目录。 */
  readonly workspaceDirectory: string;
  /** 单个 Session 的证据目录。 */
  readonly sessionDirectory: string;
  /** 不可变进程证据 JSON 文件。 */
  readonly recordFile: string;
  /** Session 级跨进程锁文件。 */
  readonly lockFile: string;
  /** 仅用于锁上下文的 Workspace ID。 */
  readonly workspaceId: WorkspaceId;
  /** 仅用于锁上下文的 Session ID。 */
  readonly sessionId: CodingTaskSessionId;
}
