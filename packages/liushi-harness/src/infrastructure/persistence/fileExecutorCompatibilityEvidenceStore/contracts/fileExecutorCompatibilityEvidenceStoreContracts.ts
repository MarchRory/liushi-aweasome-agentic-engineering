import type { ExecutorCompatibilityEvidenceProjection } from "#application/ports/index.js";
import type { ContentDigest } from "#common/index.js";
import type {
  ExecutorCapabilityEvidence,
  ExecutorCompatibilityDigestPort,
  ExecutorEvidenceLocator,
} from "#domain/executorCompatibility/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

/** File Executor Compatibility Evidence Store 的可注入依赖。 */
export interface FileExecutorCompatibilityEvidenceStoreDependencies {
  /** 跨进程排他文件锁。 */
  readonly lockManager: FileLockManager;
  /** 原子替换后的父目录耐久性边界。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
  /** RFC 8785 SHA-256 摘要计算端口。 */
  readonly digest: ExecutorCompatibilityDigestPort;
}

/** 已完成 Schema、摘要与 Locator 校验的 Evidence Projection。 */
export interface ValidatedExecutorCompatibilityEvidenceProjection {
  /** 可安全序列化的脱敏 Artifact。 */
  readonly artifact: ExecutorCompatibilityEvidenceProjection["artifact"];
  /** Artifact 的受验内容摘要。 */
  readonly artifactDigest: ContentDigest;
  /** Artifact 在 Runtime Store 内的唯一相对 Locator。 */
  readonly locator: ExecutorEvidenceLocator;
  /** 按 Evidence 摘要稳定排序后的规范证据。 */
  readonly evidence: readonly ExecutorCapabilityEvidence[];
}

/** 单个内容寻址文件的写入状态。 */
export interface ExecutorCompatibilityContentWriteOutcome {
  /** 本次是否创建了新文件。 */
  readonly persisted: boolean;
}
