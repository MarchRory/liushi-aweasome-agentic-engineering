import type { ChangeSetCheckpoint } from "#application/changeSetCheckpoint/index.js";
import type { CommandHandlerSuccess } from "#application/commandGateway/index.js";
import {
  bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint,
  bindRetriedCodingTaskSessionCloseoutRecoveryCheckpoint,
  markCodingTaskSessionCloseoutRecoveryExecuting,
  markCodingTaskSessionCloseoutRecoveryOutcomeUnknown,
  markCodingTaskSessionCloseoutRecoveryRetryNotApplied,
  requireHumanForCodingTaskSessionCloseoutRecovery,
  type CodingTaskSessionCloseoutRecoveryState,
} from "../../state/index.js";
import {
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";

import {
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_HUMAN_GUIDANCE,
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_NOT_APPLIED_GUIDANCE,
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_UNKNOWN_GUIDANCE,
} from "../constants/index.js";
import type { CodingTaskSessionCloseoutRecoveryHandlerDependencies } from "../contracts/index.js";
import { terminalRecoveryError } from "../errors/index.js";
import { replaceRecoveryState } from "./codingTaskSessionCloseoutRecoveryStoreOperations.js";

/** 统一生成、持久化并投影 Recovery Process State 迁移。 */
export class CodingTaskSessionCloseoutRecoveryStateOperations {
  public constructor(
    private readonly dependencies: CodingTaskSessionCloseoutRecoveryHandlerDependencies,
  ) {}

  public async markExecuting(
    state: CodingTaskSessionCloseoutRecoveryState,
  ): Promise<Result<CodingTaskSessionCloseoutRecoveryState, HarnessError>> {
    const successor = markCodingTaskSessionCloseoutRecoveryExecuting(
      state,
      { updatedAt: this.now() },
      this.dependencies.digest,
    );
    return successor.status === ResultStatus.Failure
      ? successor
      : replaceRecoveryState(this.dependencies.recoveryStateStore, state, successor.value);
  }

  public bindExisting(
    state: CodingTaskSessionCloseoutRecoveryState,
    checkpoint: ChangeSetCheckpoint,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const successor = bindExistingCodingTaskSessionCloseoutRecoveryCheckpoint(
      state,
      { checkpoint, updatedAt: this.now() },
      this.dependencies.digest,
    );
    return successor.status === ResultStatus.Failure
      ? Promise.resolve(successor)
      : this.commitSuccess(state, successor.value);
  }

  public bindRetried(
    state: CodingTaskSessionCloseoutRecoveryState,
    checkpoint: ChangeSetCheckpoint,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const successor = bindRetriedCodingTaskSessionCloseoutRecoveryCheckpoint(
      state,
      { checkpoint, updatedAt: this.now() },
      this.dependencies.digest,
    );
    return successor.status === ResultStatus.Failure
      ? Promise.resolve(successor)
      : this.commitSuccess(state, successor.value);
  }

  public retryNotApplied(
    state: CodingTaskSessionCloseoutRecoveryState,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const successor = markCodingTaskSessionCloseoutRecoveryRetryNotApplied(
      state,
      this.terminalInput(
        HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied,
        CODING_TASK_SESSION_CLOSEOUT_RECOVERY_NOT_APPLIED_GUIDANCE,
      ),
      this.dependencies.digest,
    );
    return successor.status === ResultStatus.Failure
      ? Promise.resolve(successor)
      : this.commitTerminal(state, successor.value);
  }

  public outcomeUnknown(
    state: CodingTaskSessionCloseoutRecoveryState,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const successor = markCodingTaskSessionCloseoutRecoveryOutcomeUnknown(
      state,
      this.terminalInput(
        HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
        CODING_TASK_SESSION_CLOSEOUT_RECOVERY_UNKNOWN_GUIDANCE,
      ),
      this.dependencies.digest,
    );
    return successor.status === ResultStatus.Failure
      ? Promise.resolve(successor)
      : this.commitTerminal(state, successor.value);
  }

  public requireHuman(
    state: CodingTaskSessionCloseoutRecoveryState,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const successor = requireHumanForCodingTaskSessionCloseoutRecovery(
      state,
      this.terminalInput(
        HarnessErrorCode.PreconditionNotMet,
        CODING_TASK_SESSION_CLOSEOUT_RECOVERY_HUMAN_GUIDANCE,
      ),
      this.dependencies.digest,
    );
    return successor.status === ResultStatus.Failure
      ? Promise.resolve(successor)
      : this.commitTerminal(state, successor.value);
  }

  private async commitSuccess(
    current: CodingTaskSessionCloseoutRecoveryState,
    successor: CodingTaskSessionCloseoutRecoveryState,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const committed = await replaceRecoveryState(
      this.dependencies.recoveryStateStore,
      current,
      successor,
    );
    return committed.status === ResultStatus.Failure
      ? committed
      : success({ committedVersion: committed.value.version });
  }

  private async commitTerminal(
    current: CodingTaskSessionCloseoutRecoveryState,
    successor: CodingTaskSessionCloseoutRecoveryState,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const committed = await replaceRecoveryState(
      this.dependencies.recoveryStateStore,
      current,
      successor,
    );
    if (committed.status === ResultStatus.Failure) return committed;
    return failure(
      terminalRecoveryError(
        committed.value.errorCode ?? HarnessErrorCode.PreconditionNotMet,
        "Closeout Recovery 已进入不可自动推进的终态。",
      ),
    );
  }

  private terminalInput(errorCode: HarnessErrorCode, recoveryGuidance: string) {
    return { errorCode, recoveryGuidance, updatedAt: this.now() };
  }

  private now(): string {
    return this.dependencies.clock.now().toISOString();
  }
}
