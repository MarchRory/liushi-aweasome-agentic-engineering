/** 查询 Task Status Use Case 的输入。 */
export interface GetTaskStatusInput {
  /** Task 所属 Workspace ID。 */
  workspaceId: string;
  /** 要查询的 Task ULID。 */
  taskId: string;
}
