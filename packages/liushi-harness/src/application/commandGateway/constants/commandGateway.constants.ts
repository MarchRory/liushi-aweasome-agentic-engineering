/** 并发调用等待首次 Reservation 落盘的最大检查次数。 */
export const COMMAND_RESERVATION_CONFLICT_ATTEMPTS = 20;

/** 并发调用每次重新获取 Reservation 前的等待毫秒数。 */
export const COMMAND_RESERVATION_CONFLICT_DELAY_MS = 10;
