/** Session Activation Lease 的独立锁文件名，不与 Activation Record 锁重用。 */
export const CODING_TASK_SESSION_ACTIVATION_LEASE_LOCK_FILE_NAME = ".activation.lease.lock";

/** Lease 竞争时采用的有限重试次数。 */
export const CODING_TASK_SESSION_ACTIVATION_LEASE_LOCK_RETRY_ATTEMPTS = 200;

/** Lease 竞争重试间隔毫秒数。 */
export const CODING_TASK_SESSION_ACTIVATION_LEASE_LOCK_RETRY_DELAY_MS = 5;
