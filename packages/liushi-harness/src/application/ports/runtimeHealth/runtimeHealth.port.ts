import type { HarnessError, Result } from "#common/index.js";

/** Runtime Store 可用性检查产生的报告。 */
export interface RuntimeHealthReport {
  /** 已规范化并通过读写检查的 Runtime Store 根目录。 */
  storeRoot: string;
  /** Store 是否支持创建并清理文件。 */
  writable: boolean;
  /** Store 是否通过原子写入和读取校验。 */
  atomicWriteVerified: boolean;
}

/** Application 检查 Runtime Store 的 Port。 */
export interface RuntimeHealthPort {
  /** 执行不触碰业务状态的文件系统健康检查。 */
  check(): Promise<Result<RuntimeHealthReport, HarnessError>>;
}
