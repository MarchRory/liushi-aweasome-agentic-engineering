import { codingTaskImplementationSubmissionCapability } from "#application/codingTask/internal/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type { CommandHandlerSuccess } from "#application/commandGateway/index.js";
import { createCodingTaskSessionCheckpointInput } from "#application/codingTaskSessionCloseout/index.js";
import type { RepositoryLockHandle } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import {
  parseCodingTaskSessionDeliverySubmissionCommand,
  type CodingTaskSessionDeliverySubmissionCommand,
  type CodingTaskSessionDeliverySubmissionCommandPayload,
} from "../command/index.js";
import { CodingTaskSessionDeliverySubmissionDisposition } from "../enums/index.js";
import type { CodingTaskSessionDeliverySubmissionHandlerDependencies } from "./contracts/index.js";
import { createCodingTaskSessionDeliveryImplementationCommand } from "./factory/index.js";
import {
  classifyCodingTaskSessionDeliverySubmission,
  resolveCodingTaskSessionDeliveryCheckpoint,
  validateCodingTaskSessionDeliveryAuthority,
  validateFreshCodingTaskSessionDeliveryCheckpoint,
} from "./validation/index.js";

/** 将 Session Effective Closeout 安全接纳为 CodingTask ImplementationSubmitted Event。 */
export class CodingTaskSessionDeliverySubmissionHandler {
  public constructor(
    private readonly dependencies: CodingTaskSessionDeliverySubmissionHandlerDependencies,
  ) {}

  /** 在 Gateway Reservation 后执行只读 Checkpoint 复验与唯一 Event 提交。 */
  public async execute(
    input: CommandEnvelope<CodingTaskSessionDeliverySubmissionCommandPayload>,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const command = parseCodingTaskSessionDeliverySubmissionCommand(
      input,
      this.dependencies.digest,
    );
    if (command.status === ResultStatus.Failure) return command;
    const state = await this.loadCloseout(command.value);
    if (state.status === ResultStatus.Failure) return state;
    const lock = await this.acquire(
      command.value.commandId,
      state.value.workspaceId,
      state.value.repositoryId,
    );
    if (lock.status === ResultStatus.Failure) return lock;

    let operation: Result<CommandHandlerSuccess, HarnessError>;
    try {
      operation = await this.runLocked(
        command.value,
        state.value.workspaceId,
        state.value.repositoryId,
      );
    } catch (error) {
      operation = failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Session Delivery Submission 锁内执行抛出异常。",
          {},
          error,
        ),
      );
    }
    return this.release(lock.value, operation);
  }

  private async runLocked(
    command: CodingTaskSessionDeliverySubmissionCommand,
    lockedWorkspaceId: Parameters<
      CodingTaskSessionDeliverySubmissionHandlerDependencies["repositoryLock"]["acquire"]
    >[0]["workspaceId"],
    lockedRepositoryId: Parameters<
      CodingTaskSessionDeliverySubmissionHandlerDependencies["repositoryLock"]["acquire"]
    >[0]["repositoryId"],
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const locator = {
      workspaceId: command.payload.workspaceId,
      sessionId: command.payload.sessionId,
    };
    const state = await this.dependencies.closeoutStateStore.load(locator);
    if (state.status === ResultStatus.Failure) return state;
    if (
      state.value.workspaceId !== lockedWorkspaceId ||
      state.value.repositoryId !== lockedRepositoryId
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Session Delivery 锁内 Closeout 仓库身份与锁前预读不一致。",
        ),
      );
    }
    const loaded = await this.dependencies.codingTaskRepository.load({
      workspaceId: state.value.workspaceId,
      codingTaskId: state.value.codingTaskId,
    });
    if (loaded.status === ResultStatus.Failure) return loaded;
    const authority = validateCodingTaskSessionDeliveryAuthority(
      command,
      state.value,
      loaded.value.aggregate,
    );
    if (authority.status === ResultStatus.Failure) return authority;
    const guarded = await this.dependencies.unresolvedProvisionGuard.check(loaded.value.aggregate);
    if (guarded.status === ResultStatus.Failure) return guarded;

    const effective = await this.dependencies.effectiveCloseoutResolver.resolve(locator);
    if (effective.status === ResultStatus.Failure) return effective;
    const expectedCheckpoint = resolveCodingTaskSessionDeliveryCheckpoint(command, effective.value);
    if (expectedCheckpoint.status === ResultStatus.Failure) return expectedCheckpoint;

    const authorized = await this.dependencies.authorizationResolver.resolve({
      sourceTaskId: loaded.value.aggregate.sourceTaskId,
      workspaceId: loaded.value.aggregate.workspaceId,
      repositoryId: loaded.value.aggregate.repositoryId,
      writeSet: loaded.value.aggregate.writeSet,
      requested: loaded.value.aggregate.executionAuthorization,
    });
    if (authorized.status === ResultStatus.Failure) return authorized;
    const root = await this.dependencies.repositoryRootResolver.resolve({
      workspaceId: loaded.value.aggregate.workspaceId,
      repositoryId: loaded.value.aggregate.repositoryId,
    });
    if (root.status === ResultStatus.Failure) return root;
    if (state.value.snapshot === null) {
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Session Delivery Submission 缺少 Closeout Snapshot。",
        ),
      );
    }

    const checkpointInput = createCodingTaskSessionCheckpointInput({
      repositoryRoot: root.value.repositoryRoot,
      aggregate: loaded.value.aggregate,
      snapshot: state.value.snapshot,
    });
    const inspected = await this.dependencies.checkpointInspector.inspect(checkpointInput);
    if (inspected.status === ResultStatus.Failure) return inspected;
    const fresh = validateFreshCodingTaskSessionDeliveryCheckpoint(
      expectedCheckpoint.value,
      inspected.value,
    );
    if (fresh.status === ResultStatus.Failure) return fresh;
    const disposition = classifyCodingTaskSessionDeliverySubmission(
      loaded.value.aggregate,
      state.value.attemptNumber,
      inspected.value,
    );
    if (disposition.status === ResultStatus.Failure) return disposition;
    if (disposition.value === CodingTaskSessionDeliverySubmissionDisposition.AlreadySubmitted) {
      return success({ committedVersion: loaded.value.aggregate.version });
    }

    const internalCommand = createCodingTaskSessionDeliveryImplementationCommand(
      this.dependencies.digest,
      command,
      state.value.attemptNumber,
      inspected.value.checkpoint,
    );
    if (internalCommand.status === ResultStatus.Failure) return internalCommand;
    const submitted = await this.dependencies.codingTaskHandler.executeImplementationSubmission(
      internalCommand.value,
      codingTaskImplementationSubmissionCapability,
    );
    if (submitted.status === ResultStatus.Success) return submitted;
    const recovered = await this.dependencies.codingTaskRepository.load({
      workspaceId: state.value.workspaceId,
      codingTaskId: state.value.codingTaskId,
    });
    if (recovered.status === ResultStatus.Failure) return submitted;
    const recovery = classifyCodingTaskSessionDeliverySubmission(
      recovered.value.aggregate,
      state.value.attemptNumber,
      inspected.value,
    );
    return recovery.status === ResultStatus.Success &&
      recovery.value === CodingTaskSessionDeliverySubmissionDisposition.AlreadySubmitted
      ? success({ committedVersion: recovered.value.aggregate.version })
      : submitted;
  }

  private async loadCloseout(command: CodingTaskSessionDeliverySubmissionCommand) {
    try {
      return await this.dependencies.closeoutStateStore.load({
        workspaceId: command.payload.workspaceId,
        sessionId: command.payload.sessionId,
      });
    } catch (error) {
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "Closeout State 加载抛出异常。", {}, error),
      );
    }
  }

  private async acquire(
    holderId: string,
    workspaceId: Parameters<
      CodingTaskSessionDeliverySubmissionHandlerDependencies["repositoryLock"]["acquire"]
    >[0]["workspaceId"],
    repositoryId: Parameters<
      CodingTaskSessionDeliverySubmissionHandlerDependencies["repositoryLock"]["acquire"]
    >[0]["repositoryId"],
  ) {
    try {
      return await this.dependencies.repositoryLock.acquire({
        workspaceId,
        repositoryId,
        holderId,
      });
    } catch (error) {
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "Repository Lock 获取抛出异常。", {}, error),
      );
    }
  }

  private async release(
    lock: RepositoryLockHandle,
    operation: Result<CommandHandlerSuccess, HarnessError>,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    let released: Awaited<ReturnType<RepositoryLockHandle["release"]>>;
    try {
      released = await lock.release();
    } catch (error) {
      released = failure(
        new HarnessError(HarnessErrorCode.IoFailure, "Repository Lock 释放抛出异常。", {}, error),
      );
    }
    if (released.status === ResultStatus.Success) return operation;
    return failure(
      new HarnessError(
        HarnessErrorCode.IoFailure,
        "Session Delivery Submission 的 Repository Lock 释放结果未知。",
        {
          operationStatus:
            operation.status === ResultStatus.Success ? "succeeded" : operation.error.code,
        },
        released.error,
      ),
    );
  }
}
