import {
  ChangeSetCheckpointRecoveryStatus,
  type ChangeSetCheckpointInput,
} from "#application/changeSetCheckpoint/index.js";
import type { CommandHandlerSuccess } from "#application/commandGateway/index.js";
import type { CodingTaskSessionCloseoutRecoveryAssessmentInternal } from "../../assessment/index.js";
import type { CodingTaskSessionCloseoutRecoveryState } from "../../state/index.js";
import { ActionOutcome } from "#domain/actionJournal/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";

import type { CodingTaskSessionCloseoutRecoveryHandlerDependencies } from "../contracts/index.js";
import type { CodingTaskSessionCloseoutRecoveryStateOperations } from "../operations/index.js";
import { hasMatchingCheckpointIdentity } from "../validation/index.js";

/** 闭合 RetryOnce 的单次副作用和 Executing 只读恢复。 */
export class CodingTaskSessionCloseoutRecoveryCheckpointExecution {
  public constructor(
    private readonly dependencies: CodingTaskSessionCloseoutRecoveryHandlerDependencies,
    private readonly stateOperations: CodingTaskSessionCloseoutRecoveryStateOperations,
  ) {}

  public async executeOnce(
    state: CodingTaskSessionCloseoutRecoveryState,
    input: ChangeSetCheckpointInput,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    let executed: Awaited<ReturnType<typeof this.dependencies.checkpoint.execute>>;
    try {
      executed = await this.dependencies.checkpoint.execute(input);
    } catch {
      return this.stateOperations.outcomeUnknown(state);
    }
    if (executed.status === ResultStatus.Failure) {
      return this.stateOperations.outcomeUnknown(state);
    }
    if (executed.value.outcome === ActionOutcome.NotApplied) {
      return this.stateOperations.retryNotApplied(state);
    }
    if (executed.value.outcome !== ActionOutcome.Succeeded) {
      return this.stateOperations.outcomeUnknown(state);
    }

    let inspected: Awaited<ReturnType<typeof this.dependencies.checkpoint.inspect>>;
    try {
      inspected = await this.dependencies.checkpoint.inspect(input);
    } catch {
      return this.stateOperations.outcomeUnknown(state);
    }
    if (
      inspected.status === ResultStatus.Failure ||
      !hasMatchingCheckpointIdentity(state, inspected.value)
    ) {
      return this.stateOperations.outcomeUnknown(state);
    }
    return this.stateOperations.bindRetried(state, inspected.value);
  }

  public recoverExecuting(
    state: CodingTaskSessionCloseoutRecoveryState,
    fresh: CodingTaskSessionCloseoutRecoveryAssessmentInternal,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    return fresh.checkpointRecovery.status === ChangeSetCheckpointRecoveryStatus.Present &&
      hasMatchingCheckpointIdentity(state, fresh.checkpointRecovery.checkpoint)
      ? this.stateOperations.bindRetried(state, fresh.checkpointRecovery.checkpoint)
      : this.stateOperations.requireHuman(state);
  }
}
