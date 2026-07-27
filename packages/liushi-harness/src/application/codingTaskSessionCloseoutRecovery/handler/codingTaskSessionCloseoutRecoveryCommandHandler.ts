import type { CommandHandlerSuccess } from "#application/commandGateway/index.js";
import { parseCodingTaskSessionCloseoutRecoveryCommand } from "#application/codingTaskSessionCloseoutRecovery/command/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type { RepositoryLockHandle } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";

import type {
  CodingTaskSessionCloseoutRecoveryCommand,
  CodingTaskSessionCloseoutRecoveryCommandPayload,
} from "../command/index.js";
import type { CodingTaskSessionCloseoutRecoveryHandlerDependencies } from "./contracts/index.js";
import { repositoryLockReleaseUnknown } from "./errors/index.js";
import { CodingTaskSessionCloseoutRecoveryExecution } from "./execution/index.js";

/** 处理经 Application Command Gateway 授权的 Closeout Recovery Human Command。 */
export class CodingTaskSessionCloseoutRecoveryCommandHandler {
  private readonly execution: CodingTaskSessionCloseoutRecoveryExecution;

  public constructor(
    private readonly dependencies: CodingTaskSessionCloseoutRecoveryHandlerDependencies,
  ) {
    this.execution = new CodingTaskSessionCloseoutRecoveryExecution(dependencies);
  }

  public async execute(
    input: CommandEnvelope<CodingTaskSessionCloseoutRecoveryCommandPayload>,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const command = parseCodingTaskSessionCloseoutRecoveryCommand(input, this.dependencies.digest);
    if (command.status === ResultStatus.Failure) return command;
    const activation = await this.loadActivation(command.value);
    if (activation.status === ResultStatus.Failure) return activation;
    const lock = await this.acquire(
      command.value.commandId,
      activation.value.workspaceId,
      activation.value.repositoryId,
    );
    if (lock.status === ResultStatus.Failure) return lock;
    let operation: Result<CommandHandlerSuccess, HarnessError>;
    try {
      operation = await this.execution.execute(command.value, activation.value.repositoryId);
    } catch (error) {
      operation = failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Closeout Recovery 锁内执行抛出异常。",
          {},
          error,
        ),
      );
    }
    return this.release(lock.value.release.bind(lock.value), operation);
  }

  private async loadActivation(command: CodingTaskSessionCloseoutRecoveryCommand) {
    try {
      return await this.dependencies.activationRepository.load({
        workspaceId: command.payload.workspaceId,
        sessionId: command.payload.sessionId,
      });
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Repository Lock 前读取 Activation 抛出异常。",
          {},
          error,
        ),
      );
    }
  }

  private async acquire(
    commandId: string,
    workspaceId: Parameters<
      CodingTaskSessionCloseoutRecoveryHandlerDependencies["repositoryLock"]["acquire"]
    >[0]["workspaceId"],
    repositoryId: Parameters<
      CodingTaskSessionCloseoutRecoveryHandlerDependencies["repositoryLock"]["acquire"]
    >[0]["repositoryId"],
  ) {
    try {
      return await this.dependencies.repositoryLock.acquire({
        workspaceId,
        repositoryId,
        holderId: commandId,
      });
    } catch (error) {
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "Repository Lock 获取抛出异常。", {}, error),
      );
    }
  }

  private async release(
    release: RepositoryLockHandle["release"],
    operation: Result<CommandHandlerSuccess, HarnessError>,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    let released: Awaited<ReturnType<typeof release>>;
    try {
      released = await release();
    } catch (error) {
      released = failure(
        new HarnessError(HarnessErrorCode.IoFailure, "Repository Lock 释放抛出异常。", {}, error),
      );
    }
    return released.status === ResultStatus.Success
      ? operation
      : failure(
          repositoryLockReleaseUnknown(
            operation.status === ResultStatus.Failure ? operation.error : undefined,
            released.error,
          ),
        );
  }
}
