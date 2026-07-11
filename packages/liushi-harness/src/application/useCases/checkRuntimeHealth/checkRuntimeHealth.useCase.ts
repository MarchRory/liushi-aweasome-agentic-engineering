import type { HarnessError, Result } from "#common/index.js";
import type { RuntimeHealthPort, RuntimeHealthReport } from "../../ports/index.js";

/** 检查 Harness Runtime Store 是否可安全使用。 */
export class CheckRuntimeHealthUseCase {
  public constructor(private readonly runtimeHealth: RuntimeHealthPort) {}

  /** 执行无业务副作用的 Runtime Store 健康检查。 */
  public async execute(): Promise<Result<RuntimeHealthReport, HarnessError>> {
    return this.runtimeHealth.check();
  }
}
