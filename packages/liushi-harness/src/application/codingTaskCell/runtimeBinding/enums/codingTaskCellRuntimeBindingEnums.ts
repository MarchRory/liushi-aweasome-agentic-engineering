/** Cell Manifest 必须与可信 CLI 绑定一致的封闭字段。 */
export enum CodingTaskCellRuntimeBindingField {
  /** Create Payload 的 Workspace 标识。 */
  WorkspaceId = "workspace_id",
  /** Create Payload 的 Repository 标识。 */
  RepositoryId = "repository_id",
  /** Repository 阶段的运行时根目录。 */
  RepositoryRoot = "repository_root",
  /** Create Payload 是否声明受管 Worktree。 */
  WorktreeManaged = "worktree_managed",
  /** Verification 阶段的受管 Worktree 根目录。 */
  WorktreeRoot = "worktree_root",
}
