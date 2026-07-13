/** Worktree Provision 恢复检查的稳定结论。 */
export enum WorktreeProvisionRecoveryInspectionStatus {
  /** 路径、Registry、分支与既有 Worktree 检查均证明创建已经生效。 */
  Applied = "applied",
  /** 路径、Registry 与分支均不存在，证明创建未生效。 */
  NotApplied = "not_applied",
  /** 事实冲突、越界或工作区状态需要 Human 判断。 */
  HumanRequired = "human_required",
  /** Root、命令或既有 Inspector 不可用，无法形成证明。 */
  Unavailable = "unavailable",
}

/** Worktree Provision 恢复检查的结构化诊断。 */
export enum WorktreeProvisionRecoveryDiagnosticCode {
  /** 可信 Repository Root 无法读取。 */
  RepositoryRootUnavailable = "repository_root_unavailable",
  /** 目标路径解析后越过可信 Root。 */
  TargetPathEscapesRoot = "target_path_escapes_root",
  /** 目标路径不存在。 */
  TargetPathAbsent = "target_path_absent",
  /** 目标路径存在且为 Root 内目录。 */
  TargetPathPresent = "target_path_present",
  /** 目标路径存在但不是可接受目录。 */
  TargetPathInvalid = "target_path_invalid",
  /** Registry 只读命令不可用。 */
  RegistryCommandUnavailable = "registry_command_unavailable",
  /** Registry porcelain 输出无法严格解析。 */
  RegistryOutputInvalid = "registry_output_invalid",
  /** Registry 不包含目标路径或目标分支。 */
  RegistryEntryAbsent = "registry_entry_absent",
  /** Registry 中目标路径与目标分支精确且唯一匹配。 */
  RegistryEntryExact = "registry_entry_exact",
  /** Registry 中路径或分支存在冲突。 */
  RegistryConflict = "registry_conflict",
  /** 分支只读命令不可用。 */
  BranchCommandUnavailable = "branch_command_unavailable",
  /** 目标分支不存在。 */
  BranchAbsent = "branch_absent",
  /** 目标分支存在。 */
  BranchPresent = "branch_present",
  /** 分支事实与 Registry 或路径事实冲突。 */
  BranchConflict = "branch_conflict",
  /** 既有 Worktree Inspector 证明状态为 Ready。 */
  InspectorReady = "inspector_ready",
  /** 既有 Worktree Inspector 发现工作区非干净。 */
  InspectorDirty = "inspector_dirty",
  /** 既有 Worktree Inspector 发现分支、HEAD 或 Write Set 不一致。 */
  InspectorMismatch = "inspector_mismatch",
  /** 既有 Worktree Inspector 无法形成证明。 */
  InspectorUnavailable = "inspector_unavailable",
}
