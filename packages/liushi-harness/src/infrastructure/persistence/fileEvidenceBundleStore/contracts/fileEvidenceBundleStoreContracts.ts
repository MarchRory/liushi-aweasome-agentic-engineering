import type { ContentDigestPort } from "#application/ports/index.js";
import type { ContentDigest } from "#common/index.js";
import type { EvidenceBundle } from "#domain/verification/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

/** File EvidenceBundle Store 的可注入依赖。 */
export interface FileEvidenceBundleStoreDependencies {
  /** 跨进程文件锁。 */
  readonly lockManager: FileLockManager;
  /** 原子写入后的父目录持久化边界。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
  /** Bundle 规范内容摘要计算器。 */
  readonly digest: ContentDigestPort;
}

/** EvidenceBundle 文件中的完整不可变记录。 */
export interface PersistedEvidenceBundle {
  /** 文件 Schema 版本。 */
  readonly schemaVersion: 1;
  /** 所属工作区标识。 */
  readonly workspaceId: string;
  /** 所属编码任务标识。 */
  readonly codingTaskId: string;
  /** 所属验证运行标识。 */
  readonly verificationRunId: string;
  /** Bundle 规范内容摘要。 */
  readonly bundleDigest: ContentDigest;
  /** 完整 EvidenceBundle。 */
  readonly bundle: EvidenceBundle;
}
