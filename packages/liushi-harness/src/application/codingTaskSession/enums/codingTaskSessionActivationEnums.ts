/** Session Activation 的确定性执行阶段。 */
export enum CodingTaskSessionActivationStage {
  /** 创建 CodingTask。 */
  Create = "create",
  /** 创建并检查受管 Worktree。 */
  Provision = "provision",
  /** 启动唯一的当前 Attempt。 */
  StartAttempt = "start_attempt",
  /** 从权威 Aggregate 重建 Session Binding。 */
  AuthoritativeBinding = "authoritative_binding",
  /** 原子持久化不可变 Activation Record。 */
  Persistence = "persistence",
}

/** Session Activation 的封闭结果。 */
export enum CodingTaskSessionActivationStatus {
  /** Activation 已闭合，可以等待外部 Agent。 */
  WaitingAgent = "waiting_agent",
  /** 确定性拒绝、冲突或前置条件阻断了 Activation。 */
  Blocked = "blocked",
  /** 无法确认某个命令副作用的最终结果。 */
  OutcomeUnknown = "outcome_unknown",
}
