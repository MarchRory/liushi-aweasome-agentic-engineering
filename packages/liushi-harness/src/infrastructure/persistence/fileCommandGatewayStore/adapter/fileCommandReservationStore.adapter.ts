import {
  COMMAND_RECEIPT_SCHEMA_VERSION,
  CommandErrorCode,
  CommandReservationDisposition,
  CommandStatus,
  createCommandReceipt,
  type CommandEnvelope,
  type CommandInvocationProvenance,
  type CommandReceipt,
  type CommandReservation,
  type CommandReservationStore,
} from "#application/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import type { ExclusiveFileLockHandle } from "#infrastructure/persistence/fileEventStore/index.js";
import { pathExists } from "#infrastructure/persistence/fileEventStore/taskStore/index.js";

import { COMMAND_RESERVATION_FILE_SCHEMA_VERSION } from "../constants/index.js";
import type {
  FileCommandReservationStoreDependencies,
  PersistedCommandReservation,
} from "../contracts/index.js";
import { readCommandReservation, writeCommandReservation } from "../io/index.js";
import { resolveCommandReservationPaths } from "../path/index.js";

/** 构造非 Committed Receipt 时允许提供的可选字段。 */
interface ResolvedReceiptFields {
  /** 稳定错误分类。 */
  readonly errorCode?: CommandErrorCode;
  /** 非敏感错误说明。 */
  readonly errorMessage?: string;
  /** Duplicate 对应的首次 Command ID。 */
  readonly duplicateOfCommandId?: string;
}

/** 使用原子 Reservation 文件实现跨进程 Command 幂等。 */
export class FileCommandReservationStore implements CommandReservationStore {
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: FileCommandReservationStoreDependencies,
  ) {}

  /** 首次持久化 Pending Reservation 后才授予 Handler 执行权。 */
  public async reserve(
    command: CommandEnvelope,
  ): Promise<Result<CommandReservation, HarnessError>> {
    const paths = resolveCommandReservationPaths(this.storeRoot, command);
    const lock = await this.acquire(paths.lockFile, command, false);
    if (lock.status === ResultStatus.Failure) return lock;
    let result: Result<CommandReservation, HarnessError>;
    try {
      result = (await pathExists(paths.recordFile))
        ? success(resolveExisting(command, await readCommandReservation(paths.recordFile)))
        : await this.createReservation(command, paths.recordFile);
      await this.dependencies.parentDirectoryDurability.syncParentDirectory(paths.recordFile);
    } catch (error) {
      return this.failBeforeExecution(error, paths.lockFile, paths.recordFile, lock.value);
    }
    try {
      await lock.value.release();
      return result;
    } catch (error) {
      const mapped = toGatewayError(error, paths.lockFile, paths.recordFile);
      return failure(
        new HarnessError(
          mapped.code,
          "Command Reservation 已写入，但 Lock 释放失败；Handler 未启动。",
          { ...mapped.details, recoveryPaths: paths.lockFile },
          mapped,
        ),
      );
    }
  }

  /** Handler 执行后原子写入 Receipt；任何失败都视为提交结果未知。 */
  public async complete(
    command: CommandEnvelope,
    receipt: CommandReceipt,
  ): Promise<Result<CommandReceipt, HarnessError>> {
    const paths = resolveCommandReservationPaths(this.storeRoot, command);
    const lock = await this.acquire(paths.lockFile, command, true);
    if (lock.status === ResultStatus.Failure) return lock;
    try {
      if (!(await pathExists(paths.recordFile))) {
        throw new Error("Command Reservation 不存在。");
      }
      const existing = await readCommandReservation(paths.recordFile);
      assertReservationOwner(existing, command);
      if (existing.receipt !== undefined) {
        if (JSON.stringify(existing.receipt) !== JSON.stringify(receipt)) {
          throw new Error("Command Reservation 已包含不同 Receipt。");
        }
      } else {
        await writeCommandReservation(paths.recordFile, { ...existing, receipt });
        await this.dependencies.parentDirectoryDurability.syncParentDirectory(paths.recordFile);
      }
      await lock.value.release();
      return success(receipt);
    } catch (error) {
      await releaseBestEffort(lock.value);
      return failure(commitOutcomeUnknown(paths.recordFile, paths.lockFile, error));
    }
  }

  private async createReservation(
    command: CommandEnvelope,
    recordFile: string,
  ): Promise<Result<CommandReservation, HarnessError>> {
    await writeCommandReservation(recordFile, {
      schemaVersion: COMMAND_RESERVATION_FILE_SCHEMA_VERSION,
      aggregateType: command.aggregateType,
      aggregateId: command.aggregateId,
      commandType: command.commandType,
      idempotencyKey: command.idempotencyKey,
      commandId: command.commandId,
      requestDigest: command.requestDigest,
      submittedAt: command.submittedAt,
      ...(command.invocationProvenance === undefined
        ? {}
        : { invocationProvenance: command.invocationProvenance }),
    });
    return success({ disposition: CommandReservationDisposition.Acquired });
  }

  private async acquire(
    lockFile: string,
    command: CommandEnvelope,
    afterExecution: boolean,
  ): Promise<Result<ExclusiveFileLockHandle, HarnessError>> {
    try {
      return success(
        await this.dependencies.lockManager.acquire(lockFile, {
          workspaceId: command.aggregateType,
          taskId: command.aggregateId,
        }),
      );
    } catch (error) {
      return failure(
        afterExecution
          ? commitOutcomeUnknown("unknown", lockFile, error)
          : toGatewayError(error, lockFile),
      );
    }
  }

  private async failBeforeExecution<T>(
    error: unknown,
    lockFile: string,
    recordFile: string,
    lock: ExclusiveFileLockHandle,
  ): Promise<Result<T, HarnessError>> {
    const released = await releaseBestEffort(lock);
    const mapped = toGatewayError(error, lockFile, recordFile);
    return failure(
      released
        ? mapped
        : new HarnessError(
            mapped.code,
            mapped.message,
            { ...mapped.details, recoveryPaths: lockFile },
            mapped,
          ),
    );
  }
}

function resolveExisting(
  command: CommandEnvelope,
  existing: PersistedCommandReservation,
): CommandReservation {
  assertScope(existing, command);
  if (existing.requestDigest !== command.requestDigest) {
    return resolvedReceipt(command, CommandStatus.Conflict, {
      errorCode: CommandErrorCode.IdempotencyConflict,
      errorMessage: "同一幂等作用域已绑定不同 Request Digest。",
    });
  }
  if (
    !isSameCommandInvocationProvenance(existing.invocationProvenance, command.invocationProvenance)
  ) {
    return resolvedReceipt(command, CommandStatus.Conflict, {
      errorCode: CommandErrorCode.IdempotencyConflict,
      errorMessage: "同一幂等作用域已绑定不同 Invocation Provenance。",
    });
  }
  if (existing.receipt === undefined) {
    return {
      disposition: CommandReservationDisposition.Pending,
      ownerCommandId: existing.commandId,
    };
  }
  if (existing.commandId === command.commandId) {
    return { disposition: CommandReservationDisposition.Resolved, receipt: existing.receipt };
  }
  return resolvedReceipt(command, CommandStatus.Duplicate, {
    duplicateOfCommandId: existing.commandId,
  });
}

function resolvedReceipt(
  command: CommandEnvelope,
  status: CommandStatus,
  optional: ResolvedReceiptFields,
): CommandReservation {
  const receipt = createCommandReceipt({
    schemaVersion: COMMAND_RECEIPT_SCHEMA_VERSION,
    commandId: command.commandId,
    requestDigest: command.requestDigest,
    status,
    ...optional,
  });
  if (receipt.status === ResultStatus.Failure) throw receipt.error;
  return { disposition: CommandReservationDisposition.Resolved, receipt: receipt.value };
}

function assertScope(existing: PersistedCommandReservation, command: CommandEnvelope): void {
  if (
    existing.aggregateType !== command.aggregateType ||
    existing.aggregateId !== command.aggregateId ||
    existing.commandType !== command.commandType ||
    existing.idempotencyKey !== command.idempotencyKey
  ) {
    throw new HarnessError(HarnessErrorCode.CorruptStore, "Command Reservation 作用域不匹配。");
  }
}

function assertReservationOwner(
  existing: PersistedCommandReservation,
  command: CommandEnvelope,
): void {
  assertScope(existing, command);
  if (
    existing.commandId !== command.commandId ||
    existing.requestDigest !== command.requestDigest ||
    !isSameCommandInvocationProvenance(existing.invocationProvenance, command.invocationProvenance)
  ) {
    throw new Error("Command Completion 与 Reservation Owner 不匹配。");
  }
}

/** 逐字段比较可选的调用来源证明，避免依赖对象序列化顺序。 */
function isSameCommandInvocationProvenance(
  existing: CommandInvocationProvenance | undefined,
  incoming: CommandInvocationProvenance | undefined,
): boolean {
  if (existing === undefined || incoming === undefined) return existing === incoming;
  return (
    existing.schemaVersion === incoming.schemaVersion &&
    existing.executor === incoming.executor &&
    existing.invocationId === incoming.invocationId &&
    existing.sessionIdDigest === incoming.sessionIdDigest &&
    existing.turnIdDigest === incoming.turnIdDigest &&
    existing.toolCallIdDigest === incoming.toolCallIdDigest &&
    existing.toolName === incoming.toolName &&
    existing.targetsDigest === incoming.targetsDigest &&
    existing.inputDigest === incoming.inputDigest
  );
}

function commitOutcomeUnknown(recordFile: string, lockFile: string, cause: unknown): HarnessError {
  return new HarnessError(
    HarnessErrorCode.CommandGatewayCommitOutcomeUnknown,
    "Command Handler 已执行，但 Receipt 持久化结果未知。",
    { recordFile, recoveryPaths: lockFile },
    cause,
  );
}

function toGatewayError(error: unknown, lockFile: string, recordFile?: string): HarnessError {
  if (error instanceof HarnessError) return error;
  return new HarnessError(
    HarnessErrorCode.IoFailure,
    "Command Reservation 持久化失败。",
    { lockFile, ...(recordFile === undefined ? {} : { recordFile }) },
    error,
  );
}

async function releaseBestEffort(lock: ExclusiveFileLockHandle): Promise<boolean> {
  try {
    await lock.release();
    return true;
  } catch {
    return false;
  }
}
