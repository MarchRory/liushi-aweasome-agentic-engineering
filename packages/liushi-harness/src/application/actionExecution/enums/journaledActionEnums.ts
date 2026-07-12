/** Journaled Action 本次调用的闭合处置。 */
export enum JournaledActionDisposition {
  /** 本次实际调用 Executor 并闭合 Journal。 */
  Executed = "executed",
  /** 既有 Action 已完成，本次未重复执行。 */
  ReusedCompleted = "reused_completed",
  /** 复用既有 Observation 并补写了确定性 Resolution。 */
  RecoveredResolution = "recovered_resolution",
  /** 证据证明未产生副作用，允许同一 Action 再次调用。 */
  RetryPermitted = "retry_permitted",
  /** 状态未知、失败或需要恢复检查，必须由 Human 处理。 */
  HumanRequired = "human_required",
}

/** Executor 已运行后 Journal 闭合失败的阶段。 */
export enum JournaledActionPersistencePhase {
  /** Action Observation 未能可靠追加。 */
  Observation = "observation",
  /** Action Resolution 未能可靠追加。 */
  Resolution = "resolution",
}
