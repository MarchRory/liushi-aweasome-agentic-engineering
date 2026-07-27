/** 需要 Human 重新决策时写入状态的稳定说明。 */
export const CODING_TASK_SESSION_CLOSEOUT_RECOVERY_HUMAN_GUIDANCE =
  "现场或持久化身份已变化，必须由 Human 重新评估 Closeout Recovery。";

/** RetryOnce 未应用时写入状态的稳定说明。 */
export const CODING_TASK_SESSION_CLOSEOUT_RECOVERY_NOT_APPLIED_GUIDANCE =
  "Checkpoint 已证明未应用；不得在此 Recovery Record 内再次执行。";

/** RetryOnce 结果无法证明时写入状态的稳定说明。 */
export const CODING_TASK_SESSION_CLOSEOUT_RECOVERY_UNKNOWN_GUIDANCE =
  "Checkpoint 执行或复验结果无法证明；必须由 Human 处理。";
