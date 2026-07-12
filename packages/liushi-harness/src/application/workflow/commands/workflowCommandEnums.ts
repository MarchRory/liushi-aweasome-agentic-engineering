/** RequirementWorkflow Command 的封闭类型集合。 */
export enum WorkflowCommandType {
  /** 创建 RequirementWorkflow Aggregate。 */
  Create = "workflow.create",
  /** 按固定 Policy 路由到下一个 Cell 或回退 Cell。 */
  RouteCell = "workflow.route_cell",
  /** 由 Human 暂停、恢复或取消 Workflow。 */
  Control = "workflow.control",
}
