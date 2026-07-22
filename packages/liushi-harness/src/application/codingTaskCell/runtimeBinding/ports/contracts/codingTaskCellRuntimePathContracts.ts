import type {
  ManagedWorktreePathPort,
  ResolveManagedWorktreeRootInput,
} from "#application/ports/managedWorktreePath/index.js";

/** 推导受管 Worktree 规范绝对路径所需的可信输入。 */
export type ResolveCodingTaskCellWorktreeRootInput = ResolveManagedWorktreeRootInput;

/** 隔离宿主路径语义的 CodingTask Cell 运行时端口。 */
export type CodingTaskCellRuntimePathPort = ManagedWorktreePathPort;
