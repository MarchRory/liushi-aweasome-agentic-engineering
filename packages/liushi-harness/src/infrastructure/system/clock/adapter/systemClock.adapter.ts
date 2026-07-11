import type { Clock } from "#common/index.js";

/** 使用系统 UTC 时间的 Clock Adapter。 */
export class SystemClock implements Clock {
  /** 返回当前系统时间。 */
  public now(): Date {
    return new Date();
  }
}
