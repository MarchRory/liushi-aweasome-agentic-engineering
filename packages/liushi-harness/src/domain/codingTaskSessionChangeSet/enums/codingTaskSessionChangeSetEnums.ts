/** CodingTask Session 可纳入权威 ChangeSet 的变化分类。 */
export enum CodingTaskSessionChangeKind {
  /** 普通文件内容或元数据发生变化。 */
  Modified = "modified",
  /** 新增文件。 */
  Added = "added",
  /** 文件被删除。 */
  Deleted = "deleted",
  /** Inspector 输入的 Rename 提示；不会进入规范 ChangeSet 输出。 */
  Renamed = "renamed",
  /** Inspector 输入的 Copy 提示；不会进入规范 ChangeSet 输出。 */
  Copied = "copied",
  /** 文件类型发生变化。 */
  TypeChanged = "type_changed",
}
