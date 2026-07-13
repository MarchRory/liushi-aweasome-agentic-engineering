import type { HarnessError, Result } from "#common/index.js";

/** 推导受管 Worktree 规范绝对路径所需的可信输入。 */
export interface ResolveCodingTaskCellWorktreeRootInput {
  /** 启动期绑定的规范绝对 Repository Root。 */
  readonly repositoryRoot: string;
  /** Create Payload 中经过严格解析的相对 POSIX 路径。 */
  readonly worktreeRelativePath: string;
}

/** 隔离宿主路径语义的 CodingTask Cell 运行时端口。 */
export interface CodingTaskCellRuntimePathPort {
  /** 校验 Repository Root 并推导唯一受管 Worktree Root。 */
  resolveManagedWorktreeRoot(
    input: ResolveCodingTaskCellWorktreeRootInput,
  ): Result<string, HarnessError>;
}
