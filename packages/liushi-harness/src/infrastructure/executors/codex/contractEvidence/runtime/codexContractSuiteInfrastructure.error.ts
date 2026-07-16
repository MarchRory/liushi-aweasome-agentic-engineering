import type { HarnessError } from "#common/index.js";

/** 仅标记 Contract Suite 内部摘要端口返回的基础设施失败。 */
export class CodexContractSuiteInfrastructureError extends Error {
  /** 保留摘要端口返回的稳定失败。 */
  public readonly failure: HarnessError;

  public constructor(failure: HarnessError) {
    super("Codex Contract Suite 基础设施失败。", { cause: failure });
    this.name = "CodexContractSuiteInfrastructureError";
    this.failure = failure;
  }
}
