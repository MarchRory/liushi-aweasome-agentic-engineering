import {
  JournaledActionDisposition,
  type JournaledActionRunner,
} from "#application/actionExecution/index.js";
import {
  CodingTaskCommandType,
  codingTaskVersionConflict,
  type CodingTaskCommandHandler,
  type CodingTaskCommandPayload,
} from "#application/codingTask/index.js";
import { codingTaskImplementationSubmissionCapability } from "#application/codingTask/internal/index.js";
import { parseCommandEnvelope, type CommandEnvelope } from "#application/command/index.js";
import type { CommandHandlerSuccess } from "#application/commandGateway/index.js";
import type {
  CodingTaskExecutionAuthorizationResolver,
  CodingTaskLocator,
  CodingTaskRepository,
  ContentDigestPort,
  GitCheckpointInput,
  GitCheckpointPort,
  RepositoryLockPort,
  RepositoryRootResolverPort,
} from "#application/ports/index.js";
import type { UnresolvedWorktreeProvisionGuard } from "#application/worktreeProvisioning/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { ActionJournalStatus } from "#domain/actionJournal/index.js";
import { parseCodingTaskId, type CodingTaskAggregate } from "#domain/codingTask/index.js";

import type {
  ImplementationSubmissionRuntimeContext,
  SubmitImplementationCommandPayload,
} from "../contracts/index.js";
import {
  implementationCheckpointClosureUnknown,
  implementationSubmissionWaitingHuman,
} from "../errors/index.js";
import {
  createImplementationCheckpointInput,
  createImplementationSubmissionIntent,
} from "../factory/index.js";
import {
  isSubmittedImplementationAttempt,
  matchesImplementationCheckpoint,
  validateImplementationSubmissionAggregate,
  validateImplementationSubmissionEnvelope,
  validateImplementationSubmissionRuntime,
  type ValidatedSubmitImplementationPayload,
} from "../validation/index.js";

/** 通过仓库锁与 Action Journal 创建 Git Checkpoint，并原子收口当前 Attempt。 */
export class ImplementationSubmissionHandler {
  public constructor(
    private readonly repository: CodingTaskRepository,
    private readonly authorizationResolver: CodingTaskExecutionAuthorizationResolver,
    private readonly repositoryRootResolver: RepositoryRootResolverPort,
    private readonly repositoryLock: RepositoryLockPort,
    private readonly journaledActionRunner: JournaledActionRunner,
    private readonly gitCheckpoint: GitCheckpointPort,
    private readonly codingTaskHandler: CodingTaskCommandHandler,
    private readonly digest: ContentDigestPort,
    private readonly unresolvedProvisionGuard: UnresolvedWorktreeProvisionGuard,
  ) {}

  /** 在 Gateway Reservation 前校验 Runtime Root 与 Command Digest 绑定。 */
  public validateRuntimeBinding(
    input: unknown,
    runtimeInput: ImplementationSubmissionRuntimeContext,
  ): Result<void, HarnessError> {
    const command = parseCommandEnvelope(input);
    if (command.status === ResultStatus.Failure) return command;
    const runtime = validateImplementationSubmissionRuntime(runtimeInput);
    if (runtime.status === ResultStatus.Failure) return runtime;
    const validated = validateImplementationSubmissionEnvelope(
      this.digest,
      command.value,
      runtime.value,
    );
    return validated.status === ResultStatus.Failure ? validated : success(undefined);
  }

  /** 执行已由 Gateway 授予执行权的实现提交命令。 */
  public async execute(
    command: CommandEnvelope<SubmitImplementationCommandPayload>,
    runtimeInput: ImplementationSubmissionRuntimeContext,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const runtime = validateImplementationSubmissionRuntime(runtimeInput);
    if (runtime.status === ResultStatus.Failure) return runtime;
    const envelope = validateImplementationSubmissionEnvelope(this.digest, command, runtime.value);
    if (envelope.status === ResultStatus.Failure) return envelope;
    const codingTaskId = parseCodingTaskId(command.aggregateId);
    if (codingTaskId.status === ResultStatus.Failure) return codingTaskId;
    const locator = {
      workspaceId: envelope.value.workspaceId,
      codingTaskId: codingTaskId.value,
    };
    const loaded = await this.repository.load(locator);
    if (loaded.status === ResultStatus.Failure) return loaded;
    const aggregate = loaded.value.aggregate;
    if (aggregate.version !== command.expectedVersion) {
      return failure(codingTaskVersionConflict(command.expectedVersion, aggregate.version));
    }
    const executable = validateImplementationSubmissionAggregate(aggregate, envelope.value);
    if (executable.status === ResultStatus.Failure) return executable;

    const lock = await this.repositoryLock.acquire({
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
      holderId: aggregate.codingTaskId,
    });
    if (lock.status === ResultStatus.Failure) return lock;
    let result: Result<CommandHandlerSuccess, HarnessError>;
    try {
      result = await this.runLocked(command, envelope.value, locator);
    } catch (error) {
      result = failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "实现提交执行发生未捕获错误，结果需要恢复检查。",
          { actionId: envelope.value.actionId },
          error,
        ),
      );
    }
    const released = await lock.value.release();
    return released.status === ResultStatus.Failure ? released : result;
  }

  private async runLocked(
    command: CommandEnvelope<SubmitImplementationCommandPayload>,
    payload: ValidatedSubmitImplementationPayload,
    locator: CodingTaskLocator,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const loaded = await this.repository.load(locator);
    if (loaded.status === ResultStatus.Failure) return loaded;
    const aggregate = loaded.value.aggregate;
    if (aggregate.version !== command.expectedVersion) {
      return failure(codingTaskVersionConflict(command.expectedVersion, aggregate.version));
    }
    const executable = validateImplementationSubmissionAggregate(aggregate, payload);
    if (executable.status === ResultStatus.Failure) return executable;
    const guarded = await this.unresolvedProvisionGuard.check(aggregate);
    if (guarded.status === ResultStatus.Failure) return guarded;
    const authorized = await this.authorizationResolver.resolve({
      sourceTaskId: aggregate.sourceTaskId,
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
      writeSet: aggregate.writeSet,
      requested: aggregate.executionAuthorization,
    });
    if (authorized.status === ResultStatus.Failure) return authorized;

    const trustedRoot = await this.repositoryRootResolver.resolve({
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
    });
    if (trustedRoot.status === ResultStatus.Failure) return trustedRoot;
    const trustedRuntime = { repositoryRoot: trustedRoot.value.repositoryRoot };
    const trustedRootDigest = this.digest.calculate(trustedRuntime);
    if (trustedRootDigest.status === ResultStatus.Failure) return trustedRootDigest;
    if (trustedRootDigest.value !== payload.repositoryRootDigest) {
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "实现提交 Runtime Root 与可信 Repository 绑定不一致。",
          { repositoryId: aggregate.repositoryId },
        ),
      );
    }

    const checkpointInput = createImplementationCheckpointInput(
      trustedRuntime.repositoryRoot,
      aggregate,
      payload.attemptNumber,
    );
    if (isSubmittedImplementationAttempt(aggregate, payload.attemptNumber)) {
      return this.recoverSubmittedAggregate(
        aggregate,
        checkpointInput,
        payload.attemptNumber,
        payload.actionId,
      );
    }
    if (command.actor.kind === ActorKind.Human) {
      const existingCheckpoint = await this.gitCheckpoint.inspect(checkpointInput);
      if (existingCheckpoint.status === ResultStatus.Success) {
        return this.submitCodingTask(command, payload, aggregate, existingCheckpoint.value);
      }
    }
    const intent = createImplementationSubmissionIntent(this.digest, command, payload, aggregate);
    if (intent.status === ResultStatus.Failure) return intent;
    const journaled = await this.journaledActionRunner.execute(
      { intent: intent.value, executionInput: checkpointInput },
      this.gitCheckpoint,
    );
    if (journaled.status === ResultStatus.Failure) return journaled;
    if (
      journaled.value.state.status !== ActionJournalStatus.Committed &&
      journaled.value.state.status !== ActionJournalStatus.Recovered
    ) {
      return journaled.value.disposition === JournaledActionDisposition.HumanRequired
        ? failure(
            implementationSubmissionWaitingHuman(payload.actionId, journaled.value.state.status),
          )
        : failure(
            new HarnessError(
              HarnessErrorCode.PreconditionNotMet,
              "Git Checkpoint 未创建；修正前置条件后创建新的命令与 Action 作用域。",
              { actionId: payload.actionId, status: journaled.value.state.status },
            ),
          );
    }
    const checkpoint = await this.gitCheckpoint.inspect(checkpointInput);
    if (checkpoint.status === ResultStatus.Failure) {
      return failure(
        implementationSubmissionWaitingHuman(
          payload.actionId,
          journaled.value.state.status,
          checkpoint.error,
        ),
      );
    }
    return this.submitCodingTask(command, payload, aggregate, checkpoint.value);
  }

  private async submitCodingTask(
    command: CommandEnvelope<SubmitImplementationCommandPayload>,
    payload: ValidatedSubmitImplementationPayload,
    aggregate: CodingTaskAggregate,
    checkpoint: { readonly targetRevision: string; readonly changedPaths: readonly string[] },
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const submitPayload = {
      workspaceId: payload.workspaceId,
      attemptNumber: payload.attemptNumber,
      targetRevision: checkpoint.targetRevision,
      changedPaths: checkpoint.changedPaths,
    };
    const requestDigest = this.digest.calculate(submitPayload);
    if (requestDigest.status === ResultStatus.Failure) return requestDigest;
    const internalCommand: CommandEnvelope<CodingTaskCommandPayload> = {
      ...command,
      commandType: CodingTaskCommandType.SubmitImplementation,
      expectedVersion: aggregate.version,
      idempotencyKey: `${command.idempotencyKey}.submit`,
      requestDigest: requestDigest.value,
      payload: submitPayload,
    };
    const submitted = await this.codingTaskHandler.executeImplementationSubmission(
      internalCommand,
      codingTaskImplementationSubmissionCapability,
    );
    if (submitted.status === ResultStatus.Success) return submitted;
    const recovered = await this.repository.load({
      workspaceId: aggregate.workspaceId,
      codingTaskId: aggregate.codingTaskId,
    });
    if (
      recovered.status === ResultStatus.Success &&
      matchesImplementationCheckpoint(recovered.value.aggregate, payload.attemptNumber, checkpoint)
    ) {
      return success({ committedVersion: recovered.value.aggregate.version });
    }
    return failure(implementationCheckpointClosureUnknown(payload.actionId, submitted.error));
  }

  private async recoverSubmittedAggregate(
    aggregate: CodingTaskAggregate,
    checkpointInput: GitCheckpointInput,
    attemptNumber: number,
    actionId: string,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const checkpoint = await this.gitCheckpoint.inspect(checkpointInput);
    if (
      checkpoint.status === ResultStatus.Success &&
      matchesImplementationCheckpoint(aggregate, attemptNumber, checkpoint.value)
    ) {
      return success({ committedVersion: aggregate.version });
    }
    return failure(
      implementationSubmissionWaitingHuman(
        actionId,
        ActionJournalStatus.WaitingHuman,
        checkpoint.status === ResultStatus.Failure ? checkpoint.error : undefined,
      ),
    );
  }
}
