/** CLI Application 启动绑定的明确作用域。 */
export enum CliApplicationBindingScope {
  /** 仅绑定 Repository Root。 */
  Repository = "repository",
  /** 绑定 CodingTask Cell 运行时。 */
  CodingTaskCell = "coding_task_cell",
  /** 绑定 CodingTask Session 运行时。 */
  CodingTaskSession = "coding_task_session",
}
