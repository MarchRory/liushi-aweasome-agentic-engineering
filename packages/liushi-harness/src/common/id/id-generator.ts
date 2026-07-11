/** 为 Application 提供稳定格式 ID 的 Port。 */
export interface IdGenerator {
  /** 生成下一个唯一 ID。 */
  next(): string;
}
