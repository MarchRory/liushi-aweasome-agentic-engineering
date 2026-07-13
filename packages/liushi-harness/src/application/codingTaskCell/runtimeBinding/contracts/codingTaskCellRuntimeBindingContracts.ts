/** 启动期可信的单仓 CodingTask Cell 运行时绑定。 */
export interface CodingTaskCellRuntimeBinding {
  /** Harness Workspace 标识。 */
  readonly workspaceId: string;
  /** 单一写入 Repository 标识。 */
  readonly repositoryId: string;
  /** Repository 规范绝对根目录。 */
  readonly repositoryRoot: string;
}
