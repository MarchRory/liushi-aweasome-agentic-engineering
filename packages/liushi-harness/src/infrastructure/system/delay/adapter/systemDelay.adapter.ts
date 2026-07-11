import type { Delay } from "#common/index.js";

/** 使用宿主定时器实现 Application 的有界等待 Port。 */
export class SystemDelayAdapter implements Delay {
  /** 等待指定毫秒数后完成。 */
  public async wait(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
