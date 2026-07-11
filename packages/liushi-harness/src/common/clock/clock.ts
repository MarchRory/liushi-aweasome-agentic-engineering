/** 为 Domain 和 Application 提供可测试时间的 Port。 */
export interface Clock {
  /** 返回当前时间。 */
  now(): Date;
}
