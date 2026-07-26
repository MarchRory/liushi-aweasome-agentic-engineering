/** CodingTask Session 可纳入权威 ChangeSet 的变化分类。 */
export enum CodingTaskSessionChangeKind {
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
}
