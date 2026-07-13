import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Clock,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type { CommandHandler, CommandHandlerSuccess } from "#application/commandGateway/index.js";
import type {
  CodingTaskExecutionAuthorizationResolver,
  CodingTaskRepository,
} from "#application/ports/index.js";

import { CODING_TASK_AGGREGATE_TYPE } from "../constants/index.js";
import {
  CodingTaskCommandType,
  type CodingTaskCommandPayload,
  type CreateCodingTaskPayload,
} from "../commands/index.js";
import { parseCodingTaskPayload } from "../validation/index.js";
import { codingTaskVersionConflict, parseCodingTaskLocator } from "./codingTaskCommandContext.js";
import { CodingTaskCommandEventFactory } from "./codingTaskCommandEventFactory.js";
import {
  codingTaskImplementationSubmissionCapability,
  type CodingTaskImplementationSubmissionCapability,
} from "../internal/index.js";

/** CodingTask Repository 使用的定位参数。 */
type CodingTaskLocator = Parameters<CodingTaskRepository["load"]>[0];

/** 负责将 CodingTask Command 转换为确定性 Event Draft 并提交。 */
export class CodingTaskCommandHandler implements CommandHandler<CodingTaskCommandPayload> {
  private readonly eventFactory: CodingTaskCommandEventFactory;

  /** 创建 CodingTask Command Handler。 */
  public constructor(
    private readonly repository: CodingTaskRepository,
    clock: Clock,
    eventIdGenerator: IdGenerator,
    private readonly authorizationResolver: CodingTaskExecutionAuthorizationResolver,
  ) {
    this.eventFactory = new CodingTaskCommandEventFactory(clock, eventIdGenerator);
  }

  /** 校验命令、读取 Aggregate，并提交一个 Event Draft。 */
  public async execute(
    command: CommandEnvelope<CodingTaskCommandPayload>,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    return this.executeCommand(command, false);
  }

  /** 持有内部能力凭证时提交实现完成命令。 */
  public async executeImplementationSubmission(
    command: CommandEnvelope<CodingTaskCommandPayload>,
    capability: CodingTaskImplementationSubmissionCapability,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    if (capability !== codingTaskImplementationSubmissionCapability) {
      return failure(publicImplementationSubmissionForbidden());
    }
    return this.executeCommand(command, true);
  }

  private async executeCommand(
    command: CommandEnvelope<CodingTaskCommandPayload>,
    implementationSubmissionAllowed: boolean,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const commandType = parseCommandType(command.commandType);
    if (commandType.status === ResultStatus.Failure) return commandType;
    if (
      commandType.value === CodingTaskCommandType.SubmitImplementation &&
      !implementationSubmissionAllowed
    ) {
      return failure(publicImplementationSubmissionForbidden());
    }
    if (command.aggregateType !== CODING_TASK_AGGREGATE_TYPE) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "CodingTask Aggregate Type 无效。"),
      );
    }

    const payload = parseCodingTaskPayload(commandType.value, command.payload);
    if (payload.status === ResultStatus.Failure) return payload;
    const locator = parseCodingTaskLocator(command.aggregateId, payload.value.workspaceId);
    if (locator.status === ResultStatus.Failure) return locator;

    if (commandType.value === CodingTaskCommandType.Create) {
      if (command.expectedVersion !== 0) {
        return failure(
          new HarnessError(
            HarnessErrorCode.InvalidInput,
            "CodingTask Create 的 expectedVersion 必须为 0。",
          ),
        );
      }
      const createPayload = payload.value as CreateCodingTaskPayload;
      const authorization = await this.authorizationResolver.resolve({
        sourceTaskId: createPayload.sourceTaskId,
        workspaceId: locator.value.workspaceId,
        repositoryId: createPayload.repositoryId,
        writeSet: createPayload.writeSet,
        requested: createPayload.executionAuthorization,
      });
      if (authorization.status === ResultStatus.Failure) return authorization;
      return this.append(
        locator.value,
        command.expectedVersion,
        this.eventFactory.create(command, locator.value, commandType.value, {
          ...createPayload,
          executionAuthorization: authorization.value,
        }),
      );
    }

    const loaded = await this.repository.load(locator.value);
    if (loaded.status === ResultStatus.Failure) return loaded;
    if (loaded.value.aggregate.version !== command.expectedVersion) {
      return failure(
        codingTaskVersionConflict(command.expectedVersion, loaded.value.aggregate.version),
      );
    }
    if (
      (commandType.value === CodingTaskCommandType.Control ||
        commandType.value === CodingTaskCommandType.ResolveHuman) &&
      command.actor.kind !== ActorKind.Human
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "CodingTask Human Command 必须由 Human 发起。",
        ),
      );
    }
    return this.append(
      locator.value,
      command.expectedVersion,
      this.eventFactory.create(
        command,
        locator.value,
        commandType.value,
        payload.value,
        loaded.value.aggregate,
      ),
    );
  }

  private async append(
    locator: CodingTaskLocator,
    expectedVersion: number,
    event: ReturnType<CodingTaskCommandEventFactory["create"]>,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const result = await this.repository.append({ locator, expectedVersion, event });
    return result.status === ResultStatus.Failure
      ? result
      : success({ committedVersion: result.value.record.aggregate.version });
  }
}

function publicImplementationSubmissionForbidden(): HarnessError {
  return new HarnessError(
    HarnessErrorCode.OperationForbidden,
    "SubmitImplementation 只能通过内部实现提交入口执行。",
  );
}

function parseCommandType(value: string): Result<CodingTaskCommandType, HarnessError> {
  const candidate = value as CodingTaskCommandType;
  return Object.values(CodingTaskCommandType).includes(candidate)
    ? success(candidate)
    : failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "CodingTask Command Type 不受支持。"),
      );
}
