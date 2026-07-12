import type { ContentDigest, RULE_CATALOG_SCHEMA_VERSION } from "#common/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { RuleStatus } from "../enums/index.js";
import type { RuleDefinition } from "./ruleDefinition.contracts.js";

/** Rule Resolution 绑定的最小 Workspace Graph 身份引用。 */
export interface WorkspaceRuleContextRef {
  /** 当前 Workspace 的稳定 ID。 */
  workspaceId: WorkspaceId;
  /** 当前 Workspace Graph 的不可变 Revision。 */
  workspaceGraphRevision: string;
  /** Workspace 所属企业规则域。 */
  organizationId?: string;
}

/** Rule Resolution 绑定的最小 Repository 与 Profile 身份引用。 */
export interface RepositoryRuleContextRef {
  /** Repository 的稳定 ID。 */
  repositoryId: RepositoryId;
  /** Task 基于的 Repository Revision。 */
  repositoryRevision: string;
  /** 当前 Project Profile Revision。 */
  projectProfileRevision: string;
  /** 当前 Architecture Mechanism Profile Revision。 */
  architectureMechanismProfileRevision?: string;
}

/** Project Rule Catalog 中用于摘要绑定的 Rule 索引项。 */
export interface RuleCatalogDigestEntry {
  /** Rule 的稳定 ID。 */
  ruleId: string;
  /** Rule 的 SemVer。 */
  version: string;
  /** Rule 当前生命周期状态。 */
  status: RuleStatus;
  /** Rule 机器字段的稳定 Digest。 */
  digest: ContentDigest;
}

/** 一个 Workspace 下可独立版本化的 Rule Catalog。 */
export interface ProjectRuleCatalog {
  /** Project Rule Catalog schema 版本。 */
  schemaVersion: typeof RULE_CATALOG_SCHEMA_VERSION;
  /** Catalog 的稳定 Registry ID。 */
  catalogId: string;
  /** Catalog 每次正式变更后严格递增的 Revision。 */
  revision: number;
  /** Catalog 绑定的 Workspace Graph 身份。 */
  workspaceRef: WorkspaceRuleContextRef;
  /** Catalog 已确认的 Repository/Profile 身份集合。 */
  repositoryRefs: readonly RepositoryRuleContextRef[];
  /** Catalog 包含的完整 Rule Definition 集合。 */
  rules: readonly RuleDefinition[];
  /** Catalog 索引与 Context Revision 的稳定 Digest。 */
  digest: ContentDigest;
}

/** Project Rule Catalog Digest 的规范输入。 */
export interface ProjectRuleCatalogDigestInput {
  /** Project Rule Catalog schema 版本。 */
  schemaVersion: typeof RULE_CATALOG_SCHEMA_VERSION;
  /** Catalog 的稳定 Registry ID。 */
  catalogId: string;
  /** Catalog 的递增 Revision。 */
  revision: number;
  /** Catalog 绑定的 Workspace Graph 身份。 */
  workspaceRef: WorkspaceRuleContextRef;
  /** Catalog 绑定的 Repository/Profile 身份集合。 */
  repositoryRefs: readonly RepositoryRuleContextRef[];
  /** 排序后的 Rule Digest 索引。 */
  rules: readonly RuleCatalogDigestEntry[];
}
