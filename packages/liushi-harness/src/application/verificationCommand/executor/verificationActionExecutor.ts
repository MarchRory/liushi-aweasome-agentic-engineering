import type {
  ActionExecutionResult,
  ActionExecutorPort,
} from "#application/actionExecution/index.js";
import type { RunAndPersistVerificationUseCase } from "#application/verificationExecution/index.js";
import type { HarnessError, Result } from "#common/index.js";
import { ResultStatus, success } from "#common/index.js";
import { ActionOutcome } from "#domain/actionJournal/index.js";

import type { RunAndPersistVerificationInput } from "#application/verificationExecution/index.js";

/** 将 Verification 执行与 Evidence 提交投影为 Journaled Action Executor。 */
export class VerificationActionExecutor implements ActionExecutorPort<RunAndPersistVerificationInput> {
  public constructor(private readonly verification: RunAndPersistVerificationUseCase) {}

  /** Bundle 无论 Passed/Failed/Blocked，只要可靠落盘就表示外部动作已成功闭合。 */
  public async execute(
    input: RunAndPersistVerificationInput,
  ): Promise<Result<ActionExecutionResult, HarnessError>> {
    const result = await this.verification.execute(input);
    if (result.status === ResultStatus.Failure) return result;
    return success({
      outcome: ActionOutcome.Succeeded,
      evidenceIds: result.value.bundle.checks.map((check) => check.evidence.evidenceId),
      outputDigest: result.value.persistence.bundleDigest,
    });
  }
}
