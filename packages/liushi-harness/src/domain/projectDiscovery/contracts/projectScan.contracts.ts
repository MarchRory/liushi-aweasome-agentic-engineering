import type { PROJECT_SCAN_MANIFEST_SCHEMA_VERSION } from "#common/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { RepositoryRole } from "../enums/index.js";

/** 一次 Project Scan 使用的确定性资源预算。 */
export interface ProjectScanBudget {
  /** 每个 Repository 最多枚举的文件数。 */
  maxFilesPerRepository: number;
  /** 每个 Repository 允许的最大目录深度。 */
  maxDepth: number;
  /** 每个 Repository 最多读取的配置文件数。 */
  maxConfigFilesPerRepository: number;
  /** 单个配置文件允许读取的最大字节数。 */
  maxConfigFileBytes: number;
  /** 每个 Repository 配置内容的总字节预算。 */
  maxTotalConfigBytesPerRepository: number;
  /** 每个 Repository 最多保留的诊断条目数。 */
  maxDiagnosticsPerRepository: number;
}

/** Project Scan Manifest 中的 Runtime-only Repository 输入。 */
export interface ProjectScanRepository {
  /** Repository 的稳定 ID。 */
  repositoryId: RepositoryId;
  /** 仅传给 FileSystem Adapter 且禁止进入报告的本机 Root。 */
  localRoot: string;
  /** Scanner 结果绑定的 Repository Revision。 */
  repositoryRevision: string;
  /** Human 提供但仍需后续确认的 Repository Role。 */
  roleHint?: RepositoryRole;
}

/** 显式多仓只读扫描输入。 */
export interface ProjectScanManifest {
  /** Project Scan Manifest Schema Version。 */
  schemaVersion: typeof PROJECT_SCAN_MANIFEST_SCHEMA_VERSION;
  /** 扫描所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 扫描绑定的 Workspace Graph Revision。 */
  workspaceGraphRevision: string;
  /** 需要独立扫描的显式 Repository Root。 */
  repositories: readonly ProjectScanRepository[];
  /** 归一化后的确定性扫描预算。 */
  budget: ProjectScanBudget;
}
