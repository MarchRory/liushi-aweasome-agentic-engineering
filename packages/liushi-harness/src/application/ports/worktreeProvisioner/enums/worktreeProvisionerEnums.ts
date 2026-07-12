/** Managed Worktree Provision 失败或阻断的稳定分类。 */
export enum WorktreeProvisionFailureCode {
  /** 输入或 Worktree Binding 无效。 */
  InvalidInput = "worktree_provision_invalid_input",
  /** Repository Root 不可用或不是目标 Git Repository。 */
  RepositoryUnavailable = "worktree_provision_repository_unavailable",
  /** Base Revision 无法解析为 Commit。 */
  BaseRevisionUnavailable = "worktree_provision_base_revision_unavailable",
  /** 目标 Branch 已存在，禁止隐式复用。 */
  BranchAlreadyExists = "worktree_provision_branch_already_exists",
  /** 目标 Worktree 路径已存在，禁止覆盖。 */
  TargetAlreadyExists = "worktree_provision_target_already_exists",
  /** Git 命令执行失败。 */
  GitCommandFailed = "worktree_provision_git_command_failed",
  /** Git 命令超时且结果需要恢复检查。 */
  GitCommandTimedOut = "worktree_provision_git_command_timed_out",
  /** 命令完成后 Worktree 后置条件仍不满足。 */
  PostconditionFailed = "worktree_provision_postcondition_failed",
}
