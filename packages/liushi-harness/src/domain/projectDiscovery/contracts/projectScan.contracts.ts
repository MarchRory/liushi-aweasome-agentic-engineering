import type { PROJECT_SCAN_MANIFEST_SCHEMA_VERSION } from "#common/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { RepositoryRole } from "../enums/index.js";

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
  /** Project Scan Manifest schema 版本。 */
  schemaVersion: typeof PROJECT_SCAN_MANIFEST_SCHEMA_VERSION;
  /** 扫描所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 扫描绑定的 Workspace Graph Revision。 */
  workspaceGraphRevision: string;
  /** 需要独立扫描的显式 Repository Root。 */
  repositories: readonly ProjectScanRepository[];
}
