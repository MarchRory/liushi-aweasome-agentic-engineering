/** Workflow 语义事件的封闭类型集合。 */
export enum WorkflowEventType {
  /** 创建 RequirementWorkflow Aggregate。 */
  WorkflowCreated = "workflow_created",
  /** 当前 Cell 已经按照固定路由发生变化。 */
  CellRouted = "cell_routed",
  /** Human 控制动作已经提交。 */
  ControlApplied = "control_applied",
}
