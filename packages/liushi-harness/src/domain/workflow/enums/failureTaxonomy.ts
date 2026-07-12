/** Workflow 验证结果的封闭失败分类。 */
export enum FailureTaxonomy {
  /** 实现与已确认契约不一致。 */
  ImplementationDefect = "implementation_defect",
  /** 需求或技术方案本身存在缺口。 */
  RequirementOrSolutionGap = "requirement_or_solution_gap",
  /** 执行环境导致结果无法按实现契约判定。 */
  EnvironmentFailure = "environment_failure",
  /** 副作用结果无法确认，不能据此自动重试。 */
  OutcomeUnknown = "outcome_unknown",
  /** 验证已通过，不属于失败。 */
  Passed = "passed",
}
