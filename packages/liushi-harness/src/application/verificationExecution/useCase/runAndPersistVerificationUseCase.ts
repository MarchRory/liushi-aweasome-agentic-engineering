import type { EvidenceBundleStore, VerificationRunnerPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import type {
  RunAndPersistVerificationInput,
  RunAndPersistVerificationOutput,
} from "../contracts/index.js";

/** 串行执行 Verification 并将完整 Bundle 强一致持久化。 */
export class RunAndPersistVerificationUseCase {
  public constructor(
    private readonly runner: VerificationRunnerPort,
    private readonly store: EvidenceBundleStore,
  ) {}

  /** 只有 Bundle 持久化成功或幂等复用后才返回成功。 */
  public async execute(
    input: RunAndPersistVerificationInput,
  ): Promise<Result<RunAndPersistVerificationOutput, HarnessError>> {
    if (input.locator.verificationRunId !== input.verificationRunId) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Verification Run 与 EvidenceBundle Locator 不一致。",
          { field: "verificationRunId" },
        ),
      );
    }
    const executed = await this.runner.run(input);
    if (executed.status === ResultStatus.Failure) return executed;
    const persisted = await this.store.persist(input.locator, executed.value);
    if (persisted.status === ResultStatus.Failure) return persisted;
    return success({ bundle: executed.value, persistence: persisted.value });
  }
}
