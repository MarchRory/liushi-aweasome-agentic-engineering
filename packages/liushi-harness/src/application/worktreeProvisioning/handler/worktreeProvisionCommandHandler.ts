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
  RepositoryLockPort,
  WorktreeProvisionerPort,
} from "#application/ports/index.js";
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

import { calculateWorktreeProvisionRuntimeDigest } from "../binding/index.js";
import {
  WORKTREE_PROVISION_COMMAND_TYPE,
  WORKTREE_PROVISION_EVIDENCE_PREFIX,
} from "../constants/index.js";
import type {
  ProvisionWorktreeCommandPayload,
  ProvisionWorktreeRuntimeContext,
} from "../contracts/index.js";
import {
  parseProvisionWorktreePayload,
  validateProvisionWorktreeRuntime,
  type ValidatedProvisionWorktreePayload,
} from "../validation/index.js";

/** 通过权威 CodingTask、Repository Lock 和 Journaled Runner 创建 Managed Worktree。 */
export class WorktreeProvisionCommandHandler {
  public constructor(
    private readonly repository: CodingTaskRepository,
    private readonly authorizationResolver: CodingTaskExecutionAuthorizationResolver,
    private readonly repositoryLock: RepositoryLockPort,
    private readonly journaledActionRunner: JournaledActionRunner,
    private readonly provisioner: WorktreeProvisionerPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 在 Gateway Reservation 前校验 Runtime Root 与 Command Digest 绑定。 */
  public validateRuntimeBinding(
    input: unknown,
    runtimeInput: ProvisionWorktreeRuntimeContext,
  ): Result<void, HarnessError> {
    const command = parseCommandEnvelope(input);
    if (command.status === ResultStatus.Failure) return command;
    const runtime = validateProvisionWorktreeRuntime(runtimeInput);
    if (runtime.status === ResultStatus.Failure) return runtime;
    const validated = this.validateEnvelope(command.value, runtime.value);
    return validated.status === ResultStatus.Failure ? validated : success(undefined);
  }

  /** 执行已经获得 Gateway Reservation 的 Worktree Provision Command。 */
  public async execute(
    command: CommandEnvelope<ProvisionWorktreeCommandPayload>,
    runtimeInput: ProvisionWorktreeRuntimeContext,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const runtime = validateProvisionWorktreeRuntime(runtimeInput);
    if (runtime.status === ResultStatus.Failure) return runtime;
    const envelope = this.validateEnvelope(command, runtime.value);
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
    const executable = validateExecutableAggregate(aggregate);
    if (executable.status === ResultStatus.Failure) return executable;
    const authorization = await this.authorizationResolver.resolve({
      sourceTaskId: aggregate.sourceTaskId,
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
      writeSet: aggregate.writeSet,
      requested: aggregate.executionAuthorization,
    });
    if (authorization.status === ResultStatus.Failure) return authorization;

    const repositoryLock = await this.repositoryLock.acquire({
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
      holderId: aggregate.codingTaskId,
    });
    if (repositoryLock.status === ResultStatus.Failure) return repositoryLock;

    let provisioned: Result<JournaledActionRunOutput, HarnessError>;
    try {
      const intent = this.createIntent(command, envelope.value, aggregate);
      if (intent.status === ResultStatus.Failure) {
        provisioned = failure(intent.error);
      } else {
        provisioned = await this.journaledActionRunner.execute(
          {
            intent: intent.value,
            executionInput: {
              repositoryId: aggregate.repositoryId,
              repositoryRoot: runtime.value.repositoryRoot,
              worktreeBinding: aggregate.worktreeBinding,
              baseRevision: aggregate.baseRevision,
              writeSet: aggregate.writeSet,
              evidenceId: `${WORKTREE_PROVISION_EVIDENCE_PREFIX}:${envelope.value.actionId}`,
            },
          },
          this.provisioner,
        );
      }
    } catch (error) {
      provisioned = failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Worktree Provision execution failed unexpectedly.",
          { codingTaskId: aggregate.codingTaskId },
          error,
        ),
      );
    }
    const released = await repositoryLock.value.release();
    if (released.status === ResultStatus.Failure) return released;
    if (provisioned.status === ResultStatus.Failure) return provisioned;
    return projectProvisionResult(provisioned.value, aggregate.version);
  }

  private validateEnvelope(
    command: CommandEnvelope,
    runtime: ProvisionWorktreeRuntimeContext,
  ): Result<ValidatedProvisionWorktreePayload, HarnessError> {
    if (
      command.commandType !== WORKTREE_PROVISION_COMMAND_TYPE ||
      command.aggregateType !== CODING_TASK_AGGREGATE_TYPE
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Worktree Provision Command scope is invalid.",
        ),
      );
    }
    const payload = parseProvisionWorktreePayload(command.payload);
    if (payload.status === ResultStatus.Failure) return payload;
    const payloadDigest = this.digest.calculate(command.payload);
    if (payloadDigest.status === ResultStatus.Failure) return payloadDigest;
    if (payloadDigest.value !== command.requestDigest) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Worktree Provision payload digest mismatch.",
        ),
      );
    }
    const runtimeDigest = calculateWorktreeProvisionRuntimeDigest(this.digest, runtime);
    if (runtimeDigest.status === ResultStatus.Failure) return runtimeDigest;
    if (runtimeDigest.value !== payload.value.repositoryRootDigest) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Worktree Provision Runtime Root does not match its digest.",
          { field: "repositoryRoot" },
        ),
      );
    }
    return payload;
  }

  private createIntent(
    command: CommandEnvelope,
    payload: ValidatedProvisionWorktreePayload,
    aggregate: CodingTaskAggregate,
  ): Result<ActionIntentRecord, HarnessError> {
    const postconditionDigest = this.digest.calculate({
      repositoryId: aggregate.repositoryId,
      worktreeBinding: aggregate.worktreeBinding,
      baseRevision: aggregate.baseRevision,
    });
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
      kind: ActionKind.GitMutation,
      target: JSON.stringify({
        repositoryId: aggregate.repositoryId,
        worktreeId: aggregate.worktreeBinding.worktreeId,
        relativePath: aggregate.worktreeBinding.relativePath,
        branchName: aggregate.worktreeBinding.branchName,
      }),
      inputDigest: command.requestDigest,
      postconditionDigest: postconditionDigest.value,
      baseRevision: aggregate.baseRevision,
      recoveryGuidance:
        "检查 Git Worktree Registry、目标 Branch、目标路径和 HEAD 后由 Human 决定恢复。",
      actor: command.actor,
      recordedAt: command.submittedAt,
    });
  }
}

function validateExecutableAggregate(aggregate: CodingTaskAggregate): Result<void, HarnessError> {
  if (
    aggregate.phase !== CodingTaskPhase.Implementation ||
    aggregate.runState !== CodingTaskRunState.Active
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidStateTransition,
        "CodingTask 当前状态不允许创建 Worktree。",
        { phase: aggregate.phase, runState: aggregate.runState },
      ),
    );
  }
  if (!aggregate.worktreeBinding.managed) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "Harness 不能创建未标记为 managed 的 Worktree。",
      ),
    );
  }
  return success(undefined);
}

function projectProvisionResult(
  result: JournaledActionRunOutput,
  aggregateVersion: number,
): Result<CommandHandlerSuccess, HarnessError> {
  switch (result.state.status) {
    case ActionJournalStatus.Committed:
    case ActionJournalStatus.Recovered:
      return success({ committedVersion: aggregateVersion });
    case ActionJournalStatus.RetryPermitted:
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "Worktree Provision 未产生副作用；修正前置条件后必须提交新的 Command。",
          { actionId: result.state.intent.actionId },
        ),
      );
    case ActionJournalStatus.WaitingHuman:
      return failure(
        new HarnessError(
          HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
          "Worktree Provision 结果需要 Human 恢复检查。",
          { actionId: result.state.intent.actionId },
        ),
      );
    case ActionJournalStatus.IntentRecorded:
    case ActionJournalStatus.AwaitingResolution:
      return failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "JournaledActionRunner 返回了非闭合 Worktree Provision 状态。",
          { actionId: result.state.intent.actionId, status: result.state.status },
        ),
      );
  }
}
