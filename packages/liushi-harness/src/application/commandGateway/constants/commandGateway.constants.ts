/** 并发调用等待 Reservation 或 Receipt 稳定落盘的最大检查次数。 */
export const COMMAND_RESERVATION_CONFLICT_ATTEMPTS = 20;

/** 并发调用每次重新检查 Reservation 或 Receipt 前的等待毫秒数。 */
export const COMMAND_RESERVATION_CONFLICT_DELAY_MS = 10;
