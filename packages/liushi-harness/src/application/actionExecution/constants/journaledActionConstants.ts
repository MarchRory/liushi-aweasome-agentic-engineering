/** Executor 抛出异常时写入 Observation 的稳定错误码。 */
export const JOURNALED_ACTION_EXECUTOR_THROWN_ERROR_CODE = "executor_threw";

/** Executor 返回 Failed 且未提供分类时使用的稳定错误码。 */
export const JOURNALED_ACTION_FAILED_ERROR_CODE = "action_failed";

/** Executor 返回 OutcomeUnknown 且未提供分类时使用的稳定错误码。 */
export const JOURNALED_ACTION_UNKNOWN_ERROR_CODE = "action_outcome_unknown";
