import type {
  JournaledActionRunner,
  JournaledActionRunOutput,
} from "#application/actionExecution/index.js";
import {
  CODING_TASK_AGGREGATE_TYPE,
  codingTaskVersionConflict,
} from "#application/codingTask/index.js";
import { parseCommandEnvelope, type CommandEnvelope } from "#application/command/index.js";
import type { CommandHandlerSuccess } from "#application/commandGateway/index.js";
import type {
  CodingTaskExecutionAuthorizationResolver,
  CodingTaskRepository,
  ContentDigestPort,
  FileMutationExecutorPort,
  RepositoryLockPort,
} from "#application/ports/index.js";
import type { UnresolvedWorktreeProvisionGuard } from "#application/worktreeProvisioning/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionJournalStatus,
  ActionKind,
  type ActionIntentRecord,
} from "#domain/actionJournal/index.js";
import {
  CodingTaskPhase,
  CodingTaskRunState,
  parseCodingTaskId,
  type CodingTaskAggregate,
} from "#domain/codingTask/index.js";

import { calculateImplementationRuntimeDigest } from "../binding/index.js";
import { IMPLEMENTATION_APPLY_COMMAND_TYPE } from "../constants/index.js";
import type {
  ApplyImplementationCommandPayload,
  ImplementationCommandRuntimeContext,
} from "../contracts/index.js";
import {
  parseApplyImplementationPayload,
  validateImplementationRuntime,
  type ValidatedApplyImplementationPayload,
} from "../validation/index.js";

/** 通过授权、仓库锁和 Journal 执行一个受控文件写入 Action。 */
export class ImplementationCommandHandler {
  public constructor(
    private readonly repository: CodingTaskRepository,
    private readonly authorizationResolver: CodingTaskExecutionAuthorizationResolver,
    private readonly repositoryLock: RepositoryLockPort,
    private readonly journaledActionRunner: JournaledActionRunner,
    private readonly executor: FileMutationExecutorPort,
    private readonly digest: ContentDigestPort,
    private readonly unresolvedProvisionGuard: UnresolvedWorktreeProvisionGuard,
  ) {}

  /** 在 Gateway Reservation 前校验路径摘要绑定。 */
  public validateRuntimeBinding(
    input: unknown,
    runtimeInput: ImplementationCommandRuntimeContext,
  ): Result<void, HarnessError> {
    const command = parseCommandEnvelope(input);
    if (command.status === ResultStatus.Failure) return command;
    const runtime = validateImplementationRuntime(runtimeInput);
    if (runtime.status === ResultStatus.Failure) return runtime;
    const envelope = this.validateEnvelope(command.value, runtime.value);
    return envelope.status === ResultStatus.Failure ? envelope : success(undefined);
  }

  /** 执行已经获得 Gateway Reservation 的受控文件写入命令。 */
  public async execute(
    command: CommandEnvelope<ApplyImplementationCommandPayload>,
    runtimeInput: ImplementationCommandRuntimeContext,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const runtime = validateImplementationRuntime(runtimeInput);
    if (runtime.status === ResultStatus.Failure) return runtime;
    const envelope = this.validateEnvelope(command, runtime.value);
    if (envelope.status === ResultStatus.Failure) return envelope;
    const codingTaskId = parseCodingTaskId(command.aggregateId);
    if (codingTaskId.status === ResultStatus.Failure) return codingTaskId;
    const loaded = await this.repository.load({
      workspaceId: envelope.value.workspaceId,
      codingTaskId: codingTaskId.value,
    });
    if (loaded.status === ResultStatus.Failure) return loaded;
    const aggregate = loaded.value.aggregate;
    if (aggregate.version !== command.expectedVersion) {
      return failure(codingTaskVersionConflict(command.expectedVersion, aggregate.version));
    }
    const executable = validateAggregate(aggregate, envelope.value);
    if (executable.status === ResultStatus.Failure) return executable;
    const authorized = await this.authorizationResolver.resolve({
      sourceTaskId: aggregate.sourceTaskId,
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
      writeSet: aggregate.writeSet,
      requested: aggregate.executionAuthorization,
    });
    if (authorized.status === ResultStatus.Failure) return authorized;

    const lock = await this.repositoryLock.acquire({
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
      holderId: aggregate.codingTaskId,
    });
    if (lock.status === ResultStatus.Failure) return lock;
    const result = await this.runLocked(command, envelope.value, runtime.value, aggregate);
    const released = await lock.value.release();
    return released.status === ResultStatus.Failure ? released : result;
  }

  private async runLocked(
    command: CommandEnvelope<ApplyImplementationCommandPayload>,
    payload: ValidatedApplyImplementationPayload,
    runtime: ImplementationCommandRuntimeContext,
    aggregate: CodingTaskAggregate,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const guarded = await this.unresolvedProvisionGuard.check(aggregate);
    if (guarded.status === ResultStatus.Failure) return guarded;
    const intent = this.createIntent(command, payload, aggregate);
    if (intent.status === ResultStatus.Failure) return intent;
    const journaled = await this.journaledActionRunner.execute(
      {
        intent: intent.value,
        executionInput: {
          repositoryId: aggregate.repositoryId,
          repositoryRoot: runtime.repositoryRoot,
          worktreeBinding: aggregate.worktreeBinding,
          baseRevision: aggregate.baseRevision,
          writeSet: aggregate.writeSet,
          mutations: payload.mutations,
        },
      },
      this.executor,
    );
    return journaled.status === ResultStatus.Failure
      ? journaled
      : projectResult(journaled.value, aggregate.version);
  }

  private validateEnvelope(
    command: CommandEnvelope,
    runtime: ImplementationCommandRuntimeContext,
  ): Result<ValidatedApplyImplementationPayload, HarnessError> {
    if (
      command.commandType !== IMPLEMENTATION_APPLY_COMMAND_TYPE ||
      command.aggregateType !== CODING_TASK_AGGREGATE_TYPE
    ) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "受控文件写入命令作用域无效。"),
      );
    }
    const payload = parseApplyImplementationPayload(command.payload);
    if (payload.status === ResultStatus.Failure) return payload;
    const requestDigest = this.digest.calculate(command.payload);
    if (requestDigest.status === ResultStatus.Failure) return requestDigest;
    if (requestDigest.value !== command.requestDigest) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "文件写入 Payload Digest 不匹配。"),
      );
    }
    const runtimeDigest = calculateImplementationRuntimeDigest(this.digest, runtime);
    if (runtimeDigest.status === ResultStatus.Failure) return runtimeDigest;
    return runtimeDigest.value === payload.value.runtimeRootDigest
      ? payload
      : failure(
          new HarnessError(HarnessErrorCode.InvalidInput, "文件写入 Runtime Root Digest 不匹配。"),
        );
  }

  private createIntent(
    command: CommandEnvelope,
    payload: ValidatedApplyImplementationPayload,
    aggregate: CodingTaskAggregate,
  ): Result<ActionIntentRecord, HarnessError> {
    const postconditionDigest = this.digest.calculate(
      payload.mutations.map(({ path, contentDigest }) => ({ path, contentDigest })),
    );
    if (postconditionDigest.status === ResultStatus.Failure) return postconditionDigest;
    return success({
      schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
      recordType: ActionJournalRecordType.Intent,
      actionId: payload.actionId,
      sequence: 1,
      workspaceId: aggregate.workspaceId,
      taskId: aggregate.sourceTaskId,
      commandId: command.commandId,
      correlationId: command.correlationId,
      ...(command.causationId === undefined ? {} : { causationId: command.causationId }),
      idempotencyKey: command.idempotencyKey,
      kind: ActionKind.FileMutation,
      target: JSON.stringify({
        repositoryId: aggregate.repositoryId,
        worktreeId: aggregate.worktreeBinding.worktreeId,
        paths: payload.mutations.map((mutation) => mutation.path),
      }),
      inputDigest: command.requestDigest,
      postconditionDigest: postconditionDigest.value,
      baseRevision: aggregate.baseRevision,
      recoveryGuidance:
        "检查目标文件摘要、Git Diff 和 Action Journal 后，由 Human 决定接受或恢复。",
      actor: command.actor,
      recordedAt: command.submittedAt,
    });
  }
}

function validateAggregate(
  aggregate: CodingTaskAggregate,
  payload: ValidatedApplyImplementationPayload,
): Result<void, HarnessError> {
  const attempt = aggregate.attempts.at(-1);
  const allowedPaths = new Set(aggregate.writeSet);
  if (
    aggregate.phase !== CodingTaskPhase.Implementation ||
    aggregate.runState !== CodingTaskRunState.Active ||
    attempt?.number !== payload.attemptNumber ||
    attempt.finishedAt !== undefined ||
    payload.mutations.some((mutation) => !allowedPaths.has(mutation.path))
  ) {
    return failure(
      new HarnessError(HarnessErrorCode.OperationForbidden, "CodingTask 不允许当前文件写入。"),
    );
  }
  return success(undefined);
}

function projectResult(
  result: JournaledActionRunOutput,
  aggregateVersion: number,
): Result<CommandHandlerSuccess, HarnessError> {
  if (
    result.state.status === ActionJournalStatus.Committed ||
    result.state.status === ActionJournalStatus.Recovered
  ) {
    return success({ committedVersion: aggregateVersion });
  }
  if (result.state.status === ActionJournalStatus.RetryPermitted) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "文件写入未应用；修正前置条件后提交新命令。",
      ),
    );
  }
  if (result.state.status === ActionJournalStatus.WaitingHuman) {
    return failure(
      new HarnessError(
        HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
        "文件写入结果需要 Human 恢复检查。",
      ),
    );
  }
  return failure(
    new HarnessError(HarnessErrorCode.CorruptStore, "文件写入 Action Journal 未闭合。"),
  );
}
