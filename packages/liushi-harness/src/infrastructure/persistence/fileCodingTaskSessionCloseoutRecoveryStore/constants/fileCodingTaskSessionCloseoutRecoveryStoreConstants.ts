/** Recovery Process State 的固定文件名。 */
export const CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_FILE_NAME =
  "closeoutRecovery.json" as const;

/** Recovery Process State mutation 使用的独立短时锁文件名。 */
export const CODING_TASK_SESSION_CLOSEOUT_RECOVERY_LOCK_FILE_NAME =
  ".closeoutRecovery.lock" as const;

/** Recovery Store 使用的 Session 目录名。 */
export const CODING_TASK_SESSION_CLOSEOUT_RECOVERY_SESSIONS_DIRECTORY_NAME =
  "codingTaskSessions" as const;
