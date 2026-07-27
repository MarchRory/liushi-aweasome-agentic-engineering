import { ChangeSetCheckpointRecoveryStatus } from "#application/changeSetCheckpoint/index.js";
import type { CommandHandlerSuccess } from "#application/commandGateway/index.js";
import type { CodingTaskSessionCloseoutRecoveryAssessmentInternal } from "../../assessment/index.js";
import type { CodingTaskSessionCloseoutRecoveryCommand } from "../../command/index.js";
import { CodingTaskSessionCloseoutRecoveryResolution } from "../../enums/index.js";
import {
  CodingTaskSessionCloseoutRecoveryStateStatus,
  type CodingTaskSessionCloseoutRecoveryState,
} from "../../state/index.js";
import { CodingTaskSessionCloseoutRecoveryStateCreateDisposition } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";

import type { CodingTaskSessionCloseoutRecoveryHandlerDependencies } from "../contracts/index.js";
import { createApprovedRecoveryState } from "../factory/index.js";
import {
  CodingTaskSessionCloseoutRecoveryStateOperations,
  persistRecoveryState,
} from "../operations/index.js";
import {
  hasFreshCommandAuthorization,
  hasMatchingCheckpointIdentity,
  hasSameApprovedAssessment,
  hasSameFreshIdentity,
  hasSamePersistedCommand,
} from "../validation/index.js";
import {
  authorizationDrift,
  isTerminalRecoveryState,
  projectTerminal,
} from "./codingTaskSessionCloseoutRecoveryExecutionResult.js";
import { CodingTaskSessionCloseoutRecoveryCheckpointExecution } from "./codingTaskSessionCloseoutRecoveryCheckpointExecution.js";

/** 在 Repository Lock 内闭合 Closeout Recovery 状态机。 */
export class CodingTaskSessionCloseoutRecoveryExecution {
  private readonly stateOperations: CodingTaskSessionCloseoutRecoveryStateOperations;
  private readonly checkpointExecution: CodingTaskSessionCloseoutRecoveryCheckpointExecution;

  public constructor(
    private readonly dependencies: CodingTaskSessionCloseoutRecoveryHandlerDependencies,
  ) {
    this.stateOperations = new CodingTaskSessionCloseoutRecoveryStateOperations(dependencies);
    this.checkpointExecution = new CodingTaskSessionCloseoutRecoveryCheckpointExecution(
      dependencies,
      this.stateOperations,
    );
  }

  public async execute(
    command: CodingTaskSessionCloseoutRecoveryCommand,
    lockedRepositoryId: string,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const found = await this.find(command);
    if (found.status === ResultStatus.Failure) return found;
    if (found.value !== null) {
      if (!hasSamePersistedCommand(found.value, command)) {
        return failure(
          new HarnessError(
            HarnessErrorCode.VersionConflict,
            "Recovery Command 身份与持久化记录不一致。",
          ),
        );
      }
      if (found.value.repositoryId !== lockedRepositoryId) {
        return failure(
          new HarnessError(
            HarnessErrorCode.PreconditionNotMet,
            "Recovery Record 与锁定 Repository 不一致。",
          ),
        );
      }
      if (isTerminalRecoveryState(found.value)) return projectTerminal(found.value);
    }

    const fresh = await this.assess(command);
    if (fresh.status === ResultStatus.Failure) return fresh;
    if (fresh.value.authority.activation.repositoryId !== lockedRepositoryId) {
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "锁定 Repository 与 fresh Activation 不一致。",
        ),
      );
    }
    return found.value === null
      ? this.createAndRun(command, fresh.value)
      : this.runExisting(command, fresh.value, found.value);
  }

  private async createAndRun(
    command: CodingTaskSessionCloseoutRecoveryCommand,
    fresh: CodingTaskSessionCloseoutRecoveryAssessmentInternal,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    if (!hasFreshCommandAuthorization(command, fresh)) return authorizationDrift();
    const initial = createApprovedRecoveryState(command, fresh);
    if (initial.status === ResultStatus.Failure) return initial;
    const created = await persistRecoveryState(() =>
      this.dependencies.recoveryStateStore.create(initial.value),
    );
    if (created.status === ResultStatus.Failure) return created;
    if (
      created.value.disposition === CodingTaskSessionCloseoutRecoveryStateCreateDisposition.Conflict
    ) {
      return failure(
        new HarnessError(HarnessErrorCode.VersionConflict, "Recovery Record 身份冲突。"),
      );
    }
    return this.runExisting(command, fresh, created.value.state);
  }

  private async runExisting(
    command: CodingTaskSessionCloseoutRecoveryCommand,
    fresh: CodingTaskSessionCloseoutRecoveryAssessmentInternal,
    state: CodingTaskSessionCloseoutRecoveryState,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    if (state.status === CodingTaskSessionCloseoutRecoveryStateStatus.Executing) {
      return hasSameFreshIdentity(state, fresh)
        ? this.checkpointExecution.recoverExecuting(state, fresh)
        : this.stateOperations.requireHuman(state);
    }
    if (
      !hasSameFreshIdentity(state, fresh) ||
      !hasSameApprovedAssessment(state, fresh) ||
      !hasFreshCommandAuthorization(command, fresh)
    ) {
      return this.stateOperations.requireHuman(state);
    }
    return state.requestedResolution === CodingTaskSessionCloseoutRecoveryResolution.BindExisting
      ? this.bindExisting(state, fresh)
      : this.retryOnce(state, fresh);
  }

  private async bindExisting(
    state: CodingTaskSessionCloseoutRecoveryState,
    fresh: CodingTaskSessionCloseoutRecoveryAssessmentInternal,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    if (
      fresh.checkpointInput === null ||
      fresh.checkpointRecovery.status !== ChangeSetCheckpointRecoveryStatus.Present ||
      fresh.checkpointRecovery.checkpoint.bindingDigest !==
        state.assessmentCheckpointBindingDigest ||
      !hasMatchingCheckpointIdentity(state, fresh.checkpointRecovery.checkpoint)
    ) {
      return this.stateOperations.requireHuman(state);
    }
    return this.stateOperations.bindExisting(state, fresh.checkpointRecovery.checkpoint);
  }

  private async retryOnce(
    state: CodingTaskSessionCloseoutRecoveryState,
    fresh: CodingTaskSessionCloseoutRecoveryAssessmentInternal,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    if (
      fresh.checkpointInput === null ||
      fresh.checkpointRecovery.status !== ChangeSetCheckpointRecoveryStatus.Absent
    ) {
      return this.stateOperations.requireHuman(state);
    }
    const committed = await this.stateOperations.markExecuting(state);
    if (committed.status === ResultStatus.Failure) return committed;
    return this.checkpointExecution.executeOnce(committed.value, fresh.checkpointInput);
  }

  private async assess(command: CodingTaskSessionCloseoutRecoveryCommand) {
    try {
      return await this.dependencies.assessmentService.assess({
        workspaceId: command.payload.workspaceId,
        sessionId: command.payload.sessionId,
      });
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Closeout Recovery Assessment 抛出异常。",
          {},
          error,
        ),
      );
    }
  }

  private async find(command: CodingTaskSessionCloseoutRecoveryCommand) {
    try {
      return await this.dependencies.recoveryStateStore.find({
        workspaceId: command.payload.workspaceId,
        sessionId: command.payload.sessionId,
      });
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Closeout Recovery State 查询抛出异常。",
          {},
          error,
        ),
      );
    }
  }
}
