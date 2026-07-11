/** 为 Application 提供可替换、可测试的有界等待能力。 */
export interface Delay {
  /** 等待指定毫秒数后完成。 */
  wait(milliseconds: number): Promise<void>;
}
