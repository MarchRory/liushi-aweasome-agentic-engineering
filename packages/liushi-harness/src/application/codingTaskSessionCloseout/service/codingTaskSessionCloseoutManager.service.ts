import {
  createCodingTaskSessionCloseoutState,
  CodingTaskSessionCloseoutStatus,
  type CodingTaskSessionCloseoutState,
} from "#application/codingTaskSessionCloseoutState/index.js";
import {
  CodingTaskSessionCloseoutStateCreateDisposition,
  type CodingTaskSessionCloseoutStateLocator,
} from "#application/ports/codingTaskSessionCloseoutStateStore/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type Result,
} from "#common/index.js";

import type {
  CodingTaskSessionCloseoutAuthority,
  CodingTaskSessionCloseoutCommand,
  CodingTaskSessionCloseoutManagerDependencies,
  CodingTaskSessionCloseoutRunResult,
} from "../contracts/index.js";
import {
  hasSameCodingTaskSessionCloseoutCommandIdentity,
  parseCodingTaskSessionCloseoutCommand,
  validateCodingTaskSessionCloseoutAuthority,
} from "../validation/index.js";
import { executeCodingTaskSessionCloseoutStateMachine } from "./codingTaskSessionCloseoutExecution.service.js";
import { persistUnknown } from "./codingTaskSessionCloseoutTerminalPersistence.service.js";

/** 可恢复地执行 CodingTask Session Closeout，生命周期严格停止在 CheckpointBound。 */
export class CodingTaskSessionCloseoutManager {
  private readonly dependencies: CodingTaskSessionCloseoutManagerDependencies;

  /** 注入权威 Repository、Admission、Coverage、Snapshot、Checkpoint 与 State 端口。 */
  public constructor(dependencies: CodingTaskSessionCloseoutManagerDependencies) {
    this.dependencies = dependencies;
  }

  /** 接收 unknown，严格解析 Command 后在 Repository Lock 内执行可恢复状态机。 */
  public async execute(
    input: unknown,
  ): Promise<Result<CodingTaskSessionCloseoutState, HarnessError>> {
    const command = parseCodingTaskSessionCloseoutCommand(input, this.dependencies.digest);
    if (command.status === ResultStatus.Failure) return command;
    const located = await invokeSafely(
      () =>
        this.dependencies.activationRepository.load({
          workspaceId: command.value.payload.workspaceId,
          sessionId: command.value.payload.sessionId,
        }),
      "Repository Lock 获取前读取 Session Activation 失败。",
    );
    if (located.status === ResultStatus.Failure) return located;
    const lock = await invokeSafely(
      () =>
        this.dependencies.repositoryLock.acquire({
          workspaceId: located.value.workspaceId,
          repositoryId: located.value.repositoryId,
          holderId: command.value.commandId,
        }),
      "Repository Lock 获取调用失败。",
    );
    if (lock.status === ResultStatus.Failure) return lock;

    let run: CodingTaskSessionCloseoutRunResult;
    try {
      run = await this.executeLocked(command.value, located.value.repositoryId);
    } catch (error) {
      run = {
        result: failure(toHarnessError(error, "Closeout 状态机执行抛出异常。")),
        state: null,
      };
    }
    return this.releaseRepositoryLock(() => lock.value.release(), run);
  }

  private async executeLocked(
    command: CodingTaskSessionCloseoutCommand,
    lockedRepositoryId: CodingTaskSessionCloseoutAuthority["activation"]["repositoryId"],
  ): Promise<CodingTaskSessionCloseoutRunResult> {
    const payload = command.payload;
    const locator: CodingTaskSessionCloseoutStateLocator = payload;
    const activation = await this.dependencies.activationRepository.load(locator);
    if (activation.status === ResultStatus.Failure) return failedRun(activation.error);
    if (activation.value.repositoryId !== lockedRepositoryId) {
      return failedRun(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Repository Lock 与重新加载的 Activation 不一致。",
        ),
      );
    }
    const codingTask = await this.dependencies.codingTaskRepository.load({
      workspaceId: activation.value.workspaceId,
      codingTaskId: activation.value.codingTaskId,
    });
    if (codingTask.status === ResultStatus.Failure) return failedRun(codingTask.error);
    const binding = await this.dependencies.bindingStore.findSession({
      workspaceId: activation.value.workspaceId,
      sessionId: activation.value.sessionId,
    });
    if (binding.status === ResultStatus.Failure) return failedRun(binding.error);
    const repositoryRoot = await this.dependencies.repositoryRootResolver.resolve({
      workspaceId: activation.value.workspaceId,
      repositoryId: activation.value.repositoryId,
    });
    if (repositoryRoot.status === ResultStatus.Failure) return failedRun(repositoryRoot.error);
    const worktreeRoot = this.dependencies.managedWorktreePath.resolveManagedWorktreeRoot({
      repositoryRoot: repositoryRoot.value.repositoryRoot,
      worktreeRelativePath: codingTask.value.aggregate.worktreeBinding.relativePath,
    });
    if (worktreeRoot.status === ResultStatus.Failure) return failedRun(worktreeRoot.error);
    const authority = validateCodingTaskSessionCloseoutAuthority({
      command,
      activation: activation.value,
      codingTask: codingTask.value,
      binding: binding.value,
      repositoryRoot: repositoryRoot.value.repositoryRoot,
      worktreeRoot: worktreeRoot.value,
      digest: this.dependencies.digest,
    });
    if (authority.status === ResultStatus.Failure) return failedRun(authority.error);
    const state = await this.loadOrCreateState(command, authority.value);
    if (state.status === ResultStatus.Failure) return failedRun(state.error);
    return executeCodingTaskSessionCloseoutStateMachine({
      command,
      authority: authority.value,
      state: state.value,
      dependencies: this.dependencies,
    });
  }

  private async loadOrCreateState(
    command: CodingTaskSessionCloseoutCommand,
    authority: CodingTaskSessionCloseoutAuthority,
  ): Promise<LoadCloseoutStateResult> {
    const locator = command.payload;
    const sessionBindingDigest = parseContentDigest(authority.binding.sessionBindingDigest);
    if (sessionBindingDigest.status === ResultStatus.Failure)
      return failure(sessionBindingDigest.error);
    const found = await this.dependencies.stateStore.find(locator);
    if (found.status === ResultStatus.Failure) return failure(found.error);
    if (found.value === null) {
      const initial = createCodingTaskSessionCloseoutState({
        workspaceId: locator.workspaceId,
        sessionId: locator.sessionId,
        codingTaskId: authority.activation.codingTaskId,
        sourceTaskId: authority.activation.sourceTaskId,
        repositoryId: authority.activation.repositoryId,
        attemptNumber: authority.activation.attemptNumber,
        activationBindingDigest: authority.activation.bindingDigest,
        sessionBindingDigest: sessionBindingDigest.value,
        requestDigest: command.requestDigest,
        idempotencyKey: command.idempotencyKey,
        commandId: command.commandId,
        correlationId: command.correlationId,
        ...(command.causationId === undefined ? {} : { causationId: command.causationId }),
        actor: command.actor,
        createdAt: command.submittedAt,
      });
      if (initial.status === ResultStatus.Failure) return initial;
      const created = await invokeSafely(
        () => this.dependencies.stateStore.create(initial.value),
        "Closeout State 创建调用失败。",
        HarnessErrorCode.CodingTaskSessionCloseoutCommitOutcomeUnknown,
      );
      if (created.status === ResultStatus.Failure) return created;
      if (created.value.disposition === CodingTaskSessionCloseoutStateCreateDisposition.Conflict) {
        return failure(
          new HarnessError(HarnessErrorCode.VersionConflict, "现有 Closeout State 身份冲突。"),
        );
      }
      return ensureStateIdentity(created.value.state, command, authority);
    }
    return ensureStateIdentity(found.value, command, authority);
  }

  private async releaseRepositoryLock(
    release: () => Promise<Result<void, HarnessError>>,
    run: CodingTaskSessionCloseoutRunResult,
  ): Promise<Result<CodingTaskSessionCloseoutState, HarnessError>> {
    let released: Result<void, HarnessError>;
    try {
      released = await release();
    } catch (error) {
      released = failure(toHarnessError(error, "Repository Lock 释放调用抛出异常。"));
    }
    if (released.status === ResultStatus.Success) return run.result;
    const lockError = new HarnessError(
      HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown,
      "Repository Lock 释放结果无法确认。",
      run.result.status === ResultStatus.Failure
        ? { operationErrorCode: run.result.error.code }
        : {},
      run.result.status === ResultStatus.Failure
        ? new AggregateError(
            [run.result.error, released.error],
            "Closeout 执行与 Repository Lock 释放均失败。",
          )
        : released.error,
    );
    if (
      run.state === null ||
      run.state.status === CodingTaskSessionCloseoutStatus.Blocked ||
      run.state.status === CodingTaskSessionCloseoutStatus.OutcomeUnknown
    ) {
      return failure(lockError);
    }
    const terminalized = await persistUnknown(run.state, this.dependencies, lockError);
    return terminalized.result.status === ResultStatus.Failure
      ? terminalized.result
      : failure(lockError);
  }
}

function ensureStateIdentity(
  state: CodingTaskSessionCloseoutState,
  command: CodingTaskSessionCloseoutCommand,
  authority: CodingTaskSessionCloseoutAuthority,
): Result<CodingTaskSessionCloseoutState, HarnessError> {
  if (
    !hasSameCodingTaskSessionCloseoutCommandIdentity(state, command, authority) ||
    state.createdAt !== command.submittedAt
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.VersionConflict,
        "Closeout State 身份冲突，拒绝覆盖现有记录。",
      ),
    );
  }
  return success(state);
}

function failedRun(error: HarnessError): CodingTaskSessionCloseoutRunResult {
  return { result: failure(error), state: null };
}

/** loadOrCreateState 的内部结果，身份冲突只返回失败且不提供可写 State。 */
type LoadCloseoutStateResult = Result<CodingTaskSessionCloseoutState, HarnessError>;

function toHarnessError(
  error: unknown,
  message: string,
  fallbackCode: HarnessErrorCode = HarnessErrorCode.IoFailure,
): HarnessError {
  return error instanceof HarnessError ? error : new HarnessError(fallbackCode, message, {}, error);
}

async function invokeSafely<T>(
  operation: () => Promise<Result<T, HarnessError>>,
  message: string,
  fallbackCode: HarnessErrorCode = HarnessErrorCode.IoFailure,
): Promise<Result<T, HarnessError>> {
  try {
    return await operation();
  } catch (error) {
    return failure(
      error instanceof HarnessError ? error : new HarnessError(fallbackCode, message, {}, error),
    );
  }
}
