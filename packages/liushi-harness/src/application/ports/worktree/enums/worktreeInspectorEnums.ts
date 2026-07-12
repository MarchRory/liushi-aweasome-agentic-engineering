/** Worktree 只读检查的总体状态。 */
export enum WorktreeInspectionStatus {
  /** 分支、基线和工作区均满足约束。 */
  Ready = "ready",
  /** 存在变化且所有变化都在声明的 Write Set 内。 */
  Dirty = "dirty",
  /** 当前 HEAD 与锁定的 Base Revision 不一致。 */
  BaseRevisionDrift = "base_revision_drift",
  /** 当前工作树分支与绑定分支不一致。 */
  BranchMismatch = "branch_mismatch",
  /** 至少一个变化路径越过声明的 Write Set。 */
  WriteSetViolation = "write_set_violation",
  /** 无法可靠完成检查，调用方必须按不可用处理。 */
  Unavailable = "unavailable",
}

/** Git 工作区变化的闭合分类。 */
export enum WorktreeChangeKind {
  /** 普通文件内容或元数据发生变化。 */
  Modified = "modified",
  /** 新增文件。 */
  Added = "added",
  /** 文件被删除。 */
  Deleted = "deleted",
  /** 文件被重命名。 */
  Renamed = "renamed",
  /** 文件被复制。 */
  Copied = "copied",
  /** 未被 Git 跟踪的新文件。 */
  Untracked = "untracked",
  /** 文件类型发生变化。 */
  TypeChanged = "type_changed",
  /** Git 报告存在未合并状态。 */
  Unmerged = "unmerged",
  /** Git 返回了当前解析器未支持的变化编码。 */
  Unknown = "unknown",
}

/** 只读检查期间执行的 Git 操作。 */
export enum WorktreeGitOperation {
  /** 读取 Git 认定的 Worktree 根目录。 */
  ResolveWorktreeRoot = "resolve_worktree_root",
  /** 读取当前分支。 */
  ResolveBranch = "resolve_branch",
  /** 读取当前 HEAD Revision。 */
  ResolveHeadRevision = "resolve_head_revision",
  /** 将声明的 Base Revision 解析为 Commit。 */
  ResolveBaseRevision = "resolve_base_revision",
  /** 读取 porcelain-v1 工作区状态。 */
  ReadStatus = "read_status",
}

/** Worktree 检查报告中的稳定诊断码。 */
export enum WorktreeInspectionDiagnosticCode {
  /** Repository Root 无法读取或不是目录。 */
  RepositoryRootUnavailable = "repository_root_unavailable",
  /** Worktree 目标路径无法读取或不是目录。 */
  WorktreeUnavailable = "worktree_unavailable",
  /** Worktree 路径解析后越过 Repository Root。 */
  WorktreePathEscapesRoot = "worktree_path_escapes_root",
  /** Git 报告的真实 Worktree Root 与绑定路径不一致。 */
  ActualRootMismatch = "actual_root_mismatch",
  /** 当前目录不是可用的 Git Worktree。 */
  GitRepositoryUnavailable = "git_repository_unavailable",
  /** 某个 Git 操作返回了失败退出码。 */
  GitCommandFailed = "git_command_failed",
  /** 某个 Git 操作超过了配置的超时时间。 */
  GitCommandTimedOut = "git_command_timed_out",
  /** Git 输出无法按预期格式解析。 */
  GitOutputInvalid = "git_output_invalid",
  /** Base Revision 不是安全的 Git Revision 参数。 */
  UnsafeBaseRevision = "unsafe_base_revision",
  /** 当前分支与绑定分支不一致。 */
  BranchMismatch = "branch_mismatch",
  /** 当前 HEAD 与解析后的 Base Revision 不一致。 */
  BaseRevisionMismatch = "base_revision_mismatch",
  /** 某个变化路径不在声明的 Write Set 内。 */
  DirtyPathOutsideWriteSet = "dirty_path_outside_write_set",
  /** Git 状态中出现了不安全的相对路径。 */
  UnsafeStatusPath = "unsafe_status_path",
}
