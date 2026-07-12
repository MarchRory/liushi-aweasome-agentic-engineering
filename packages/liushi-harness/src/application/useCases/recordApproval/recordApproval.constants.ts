/** 并发审批在锁或版本冲突后最多检查已提交幂等结果的次数。 */
export const APPROVAL_CONFLICT_RESOLUTION_ATTEMPTS = 80;

/** 并发审批每次重新读取权威 Event Store 前的等待毫秒数。 */
export const APPROVAL_CONFLICT_RESOLUTION_DELAY_MS = 25;
