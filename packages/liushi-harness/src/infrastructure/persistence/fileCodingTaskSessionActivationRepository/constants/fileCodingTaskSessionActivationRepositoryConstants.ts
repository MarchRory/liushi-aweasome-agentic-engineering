/** Activation Record 的存储目录名。 */
export const CODING_TASK_SESSION_ACTIVATIONS_DIRECTORY_NAME = "codingTaskSessions";

/** Activation Record 的固定文件名。 */
export const CODING_TASK_SESSION_ACTIVATION_FILE_NAME = "activation.json";

/** Activation Record 的跨进程锁文件名。 */
export const CODING_TASK_SESSION_ACTIVATION_LOCK_FILE_NAME = ".activation.lock";

/** 锁竞争时允许的最大重试次数。 */
export const CODING_TASK_SESSION_ACTIVATION_LOCK_RETRY_ATTEMPTS = 200;

/** 两次锁竞争重试之间的等待毫秒数。 */
export const CODING_TASK_SESSION_ACTIVATION_LOCK_RETRY_DELAY_MS = 5;
