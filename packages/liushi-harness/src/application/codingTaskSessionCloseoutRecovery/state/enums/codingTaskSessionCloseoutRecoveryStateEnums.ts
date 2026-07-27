/** Closeout Recovery Process Record 的状态机状态。 */
export enum CodingTaskSessionCloseoutRecoveryStateStatus {
  /** Human 已批准一个尚未执行的恢复决策。 */
  Approved = "approved",
  /** RetryOnce 的执行意图已持久化，尚未允许再次执行。 */
  Executing = "executing",
  /** 已绑定并完整复验 ChangeSet Checkpoint。 */
  CheckpointBound = "checkpoint_bound",
  /** 已证明本次 RetryOnce 没有应用 Checkpoint。 */
  RetryNotApplied = "retry_not_applied",
  /** 执行或持久化结果无法证明，禁止再次执行。 */
  OutcomeUnknown = "outcome_unknown",
  /** 现场或输入不足，需要 Human 决策。 */
  HumanRequired = "human_required",
}
