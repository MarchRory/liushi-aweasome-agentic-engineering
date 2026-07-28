import type { HarnessError, Result } from "#common/index.js";

/** 推导受管 Worktree 规范绝对路径所需的可信输入。 */
export interface ResolveManagedWorktreeRootInput {
  /** 启动期绑定的规范绝对 Repository Root。 */
  readonly repositoryRoot: string;
  /** 已通过领域校验的相对 POSIX Worktree 路径。 */
  readonly worktreeRelativePath: string;
}

/** 隔离宿主路径语义的通用受管 Worktree 路径端口。 */
export interface ManagedWorktreePathPort {
  /** 校验 Repository Root 并推导唯一受管 Worktree Root。 */
  resolveManagedWorktreeRoot(input: ResolveManagedWorktreeRootInput): Result<string, HarnessError>;
  /** 按当前宿主平台规则判断两个绝对路径是否具有相同身份。 */
  hasSamePathIdentity(left: string, right: string): boolean;
}
