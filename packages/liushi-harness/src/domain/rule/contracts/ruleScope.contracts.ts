import type { TaskId } from "#domain/task/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { RuleScopeLevel } from "../enums/index.js";

/** 对所有 Workspace 生效的 Harness 硬不变量 Scope。 */
export interface HarnessRuleScope {
  /** Scope 的封闭层级。 */
  level: RuleScopeLevel.Harness;
}

/** 对一个企业规则域生效的 Scope。 */
export interface OrganizationRuleScope {
  /** Scope 的封闭层级。 */
  level: RuleScopeLevel.Organization;
  /** 企业规则域的稳定 Registry ID。 */
  organizationId: string;
}

/** 对一个多仓 Workspace 生效的 Scope。 */
export interface WorkspaceRuleScope {
  /** Scope 的封闭层级。 */
  level: RuleScopeLevel.Workspace;
  /** Rule 生效的 Workspace。 */
  workspaceId: WorkspaceId;
}

/** 对一个 Repository 生效的 Scope。 */
export interface RepositoryRuleScope {
  /** Scope 的封闭层级。 */
  level: RuleScopeLevel.Repository;
  /** Repository 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** Rule 生效的 Repository。 */
  repositoryId: RepositoryId;
}

/** 对 Repository 内一个路径前缀生效的 Scope。 */
export interface PathRuleScope {
  /** Scope 的封闭层级。 */
  level: RuleScopeLevel.Path;
  /** Repository 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** Path 所属 Repository。 */
  repositoryId: RepositoryId;
  /** 使用正斜杠且不包含通配符的相对路径前缀。 */
  pathPrefix: string;
}

/** 对单个 Task 生效的已批准补充 Scope。 */
export interface TaskRuleScope {
  /** Scope 的封闭层级。 */
  level: RuleScopeLevel.Task;
  /** Task 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** Rule 生效的 Task。 */
  taskId: TaskId;
}

/** Rule 可以声明的完整 Scope 判别联合。 */
export type RuleScope =
  | HarnessRuleScope
  | OrganizationRuleScope
  | WorkspaceRuleScope
  | RepositoryRuleScope
  | PathRuleScope
  | TaskRuleScope;
