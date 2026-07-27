import type { ActionExecutionResult } from "../../../../src/application/actionExecution/index.js";
import { ActionOutcome } from "../../../../src/domain/actionJournal/index.js";
import { ResultStatus, success } from "../../../../src/common/index.js";
import type { Result, HarnessError } from "../../../../src/common/index.js";

import type { CloseoutRecoveryCheckpointExecute } from "../contracts/index.js";

/** 构造一次性 NotApplied checkpoint fault。 */
export function createNotAppliedCheckpointFault(): CloseoutRecoveryCheckpointExecute {
  return (): Promise<Result<ActionExecutionResult, HarnessError>> =>
    Promise.resolve(success({ outcome: ActionOutcome.NotApplied, evidenceIds: [] }));
}

/** 先执行真实 checkpoint，再把已确认的成功观察映射为 OutcomeUnknown。 */
export function createOutcomeUnknownAfterRealCommitFault(
  realExecute: CloseoutRecoveryCheckpointExecute,
): CloseoutRecoveryCheckpointExecute {
  return async (input) => {
    const executed = await realExecute(input);
    if (executed.status === ResultStatus.Failure) throw executed.error;
    if (executed.value.outcome !== ActionOutcome.Succeeded) {
      throw new Error("真实 checkpoint 执行结果不是 Succeeded。");
    }
    return success({ outcome: ActionOutcome.OutcomeUnknown, evidenceIds: [] });
  };
}
