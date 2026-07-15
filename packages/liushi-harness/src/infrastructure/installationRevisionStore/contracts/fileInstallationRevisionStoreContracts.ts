import type { ContentDigestPort } from "#application/ports/index.js";
import type { InstallationRevisionRecord } from "#domain/installation/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

/** 可替换的原子记录写入边界，生产默认实现使用 write-file-atomic。 */
export interface InstallationRevisionRecordWriter {
  /** 原子替换完整权威记录。 */
  write(filePath: string, record: InstallationRevisionRecord): Promise<void>;
}

/** FileInstallationRevisionStore 的持久化依赖。 */
export interface FileInstallationRevisionStoreDependencies {
  /** 跨进程排他文件锁。 */
  readonly lockManager: FileLockManager;
  /** 原子替换后的父目录耐久化边界。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
  /** RFC 8785 内容与记录摘要计算器。 */
  readonly digest: ContentDigestPort;
  /** 仅用于故障注入或平台替换的原子记录写入器。 */
  readonly recordWriter?: InstallationRevisionRecordWriter;
}

/** 从 records 目录文件名解析出的权威记录身份。 */
export interface InstallationRevisionRecordFileIdentity {
  /** 文件名前缀中的 Revision ID。 */
  readonly revisionId: string;
  /** 文件名后缀中的幂等键 SHA-256 十六进制摘要。 */
  readonly idempotencyDigestToken: string;
}

/** 单个 Repository 在 Runtime Store 中的固定派生路径。 */
export interface InstallationRevisionRepositoryPaths {
  /** Repository 对应的 Store 目录。 */
  readonly repositoryDirectory: string;
  /** 仅存放完整权威 Revision 记录的目录。 */
  readonly recordsDirectory: string;
  /** 存放幂等键锁与 Revision 锁的目录。 */
  readonly locksDirectory: string;
}
