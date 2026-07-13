import type { HarnessError, Result } from "#common/index.js";

/** Repository Root 解析请求，仅使用稳定身份定位受信任配置。 */
export interface ResolveRepositoryRootInput {
  /** Repository 所属 Workspace。 */
  readonly workspaceId: string;
  /** 目标 Repository 的稳定标识。 */
  readonly repositoryId: string;
}

/** 由可信配置提供给静态解析器的 Repository Root 绑定。 */
export interface RepositoryRootBinding extends ResolveRepositoryRootInput {
  /** 目标 Repository 的本机绝对路径。 */
  readonly repositoryRoot: string;
}

/** 已完成规范化、可作为可信基础目录使用的解析结果。 */
export interface ResolvedRepositoryRoot {
  /** 目标 Repository 的规范绝对路径。 */
  readonly repositoryRoot: string;
}

/** 根据 Workspace 与 Repository 稳定身份解析可信 Repository Root 的边界。 */
export interface RepositoryRootResolverPort {
  /** 精确解析已配置绑定；不得回退到调用方声明的运行时路径。 */
  resolve(input: ResolveRepositoryRootInput): Promise<Result<ResolvedRepositoryRoot, HarnessError>>;
}
