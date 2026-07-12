/** Workflow 支持的强一致性聚合边界。 */
export enum WorkflowKind {
  /** 需求从 PRD 到 PR-ready 的生命周期。 */
  Requirement = "requirement",
  /** 单仓编码实现与验证生命周期。 */
  CodingTask = "coding_task",
}

/** RequirementWorkflow 首版固定 Cell 集合。 */
export enum WorkflowCellKind {
  /** 接收并登记 PRD 输入。 */
  PrdIntake = "prd_intake",
  /** 组装仓库、规则、Wiki 和 Revision 上下文。 */
  ContextAssembly = "context_assembly",
  /** 形成需求、范围和验收分析。 */
  RequirementAnalysis = "requirement_analysis",
  /** 与产品和 Human 确认业务语义。 */
  ProductAlignment = "product_alignment",
  /** 形成技术方案、依赖和风险。 */
  TechnicalSolution = "technical_solution",
  /** 形成测试 Oracle 和测试用例。 */
  TestDesign = "test_design",
  /** 委托给单仓 CodingTask 实现。 */
  CodingTask = "coding_task",
  /** 执行独立验证并分类结果。 */
  Verification = "verification",
  /** 等待 Human 对异常或决策进行处理。 */
  HumanDecision = "human_decision",
  /** 独立复核变更和 Evidence。 */
  IndependentReview = "independent_review",
  /** 形成按仓库装配的 PR-ready 资格。 */
  PrReady = "pr_ready",
  /** 形成待治理的 Learning Candidate。 */
  LearningCandidate = "learning_candidate",
}

/** Workflow 运行态的封闭集合。 */
export enum WorkflowRunState {
  /** 当前允许继续执行 Cell。 */
  Active = "active",
  /** 当前等待 Human 决策。 */
  WaitingHuman = "waiting_human",
  /** 已由 Human 暂停。 */
  Paused = "paused",
  /** 已完成且不可继续。 */
  Completed = "completed",
  /** 已取消且不可继续。 */
  Cancelled = "cancelled",
}

/** Human 控制 Workflow 的封闭动作集合。 */
export enum WorkflowControlAction {
  /** 暂停当前 Workflow。 */
  Pause = "pause",
  /** 恢复已暂停 Workflow。 */
  Resume = "resume",
  /** 取消当前 Workflow。 */
  Cancel = "cancel",
}

/** Workflow 路由的语义分类。 */
export enum WorkflowRouteKind {
  /** 按固定顺序进入下一个 Cell。 */
  Forward = "forward",
  /** 因实现或方案问题回退重做。 */
  FailureRecovery = "failure_recovery",
  /** 因环境或未知结果交给 Human。 */
  HumanEscalation = "human_escalation",
}
