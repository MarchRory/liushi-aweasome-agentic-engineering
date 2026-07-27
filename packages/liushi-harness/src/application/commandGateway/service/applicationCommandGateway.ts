import {
  CommandErrorCode,
  CommandStatus,
  createCommandReceipt,
  parseCommandEnvelope,
  type CommandEnvelope,
  type CommandReceipt,
} from "#application/command/index.js";
import {
  CommandReservationDisposition,
  type CommandReservationStore,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Delay,
  type Result,
} from "#common/index.js";

import type { CommandHandler } from "../contracts/index.js";
import {
  COMMAND_RESERVATION_CONFLICT_ATTEMPTS,
  COMMAND_RESERVATION_CONFLICT_DELAY_MS,
} from "../constants/index.js";

/** 版本化 Application Command 的进程内持久化 Gateway。 */
export class ApplicationCommandGateway {
  public constructor(
    private readonly store: CommandReservationStore,
    private readonly delay: Delay,
  ) {}

  /** 每个幂等作用域最多调用一次 Handler，并始终返回稳定 Receipt。 */
  public async execute<TPayload>(
    input: unknown,
    handler: CommandHandler<TPayload>,
  ): Promise<Result<CommandReceipt, HarnessError>> {
    const parsed = parseCommandEnvelope(input);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const command = parsed.value as CommandEnvelope<TPayload>;
    const reservation = await this.reserve(command);
    if (reservation.status === ResultStatus.Failure) return reservation;
    if (reservation.value.disposition === CommandReservationDisposition.Resolved) {
      return success(reservation.value.receipt);
    }
    if (reservation.value.disposition === CommandReservationDisposition.Pending) {
      return success(
        outcomeUnknownReceipt(
          command,
          `Command ${reservation.value.ownerCommandId} 仍处于 Pending，禁止重复执行。`,
        ),
      );
    }

    let receipt: CommandReceipt;
    try {
      const handled = await handler.execute(command);
      receipt =
        handled.status === ResultStatus.Success
          ? committedReceipt(command, handled.value.committedVersion)
          : errorReceipt(command, handled.error);
    } catch (error) {
      receipt = errorReceipt(
        command,
        error instanceof HarnessError
          ? error
          : new HarnessError(
              HarnessErrorCode.IoFailure,
              "Command Handler 执行结果未知。",
              {},
              error,
            ),
      );
    }

    const completed = await this.complete(command, receipt);
    return completed.status === ResultStatus.Success
      ? completed
      : success(outcomeUnknownReceipt(command, completed.error.message));
  }

  private async reserve(command: CommandEnvelope) {
    let reservation = await this.store.reserve(command);
    for (let attempt = 0; attempt < COMMAND_RESERVATION_CONFLICT_ATTEMPTS; attempt += 1) {
      const shouldWait =
        (reservation.status === ResultStatus.Failure &&
          reservation.error.code === HarnessErrorCode.LockUnavailable) ||
        (reservation.status === ResultStatus.Success &&
          reservation.value.disposition === CommandReservationDisposition.Pending);
      if (!shouldWait) return reservation;
      await this.delay.wait(COMMAND_RESERVATION_CONFLICT_DELAY_MS);
      reservation = await this.store.reserve(command);
    }
    return reservation;
  }

  private async complete(command: CommandEnvelope, receipt: CommandReceipt) {
    let completed = await this.store.complete(command, receipt);
    for (let attempt = 0; attempt < COMMAND_RESERVATION_CONFLICT_ATTEMPTS; attempt += 1) {
      if (
        completed.status === ResultStatus.Success ||
        completed.error.code !== HarnessErrorCode.CommandGatewayCommitOutcomeUnknown
      ) {
        return completed;
      }
      await this.delay.wait(COMMAND_RESERVATION_CONFLICT_DELAY_MS);
      completed = await this.store.complete(command, receipt);
    }
    return completed;
  }
}

function committedReceipt(command: CommandEnvelope, committedVersion: number): CommandReceipt {
  return unwrapReceipt({
    commandId: command.commandId,
    requestDigest: command.requestDigest,
    status: CommandStatus.Committed,
    committedVersion,
  });
}

function errorReceipt(command: CommandEnvelope, error: HarnessError): CommandReceipt {
  if (error.code === HarnessErrorCode.VersionConflict) {
    return unwrapReceipt({
      commandId: command.commandId,
      requestDigest: command.requestDigest,
      status: CommandStatus.Conflict,
      errorCode: CommandErrorCode.VersionConflict,
      errorMessage: error.message,
    });
  }
  if (
    error.code === HarnessErrorCode.EventLogCommitOutcomeUnknown ||
    error.code === HarnessErrorCode.ActionJournalCommitOutcomeUnknown ||
    error.code === HarnessErrorCode.ActionExecutionLockReleaseUnknown ||
    error.code === HarnessErrorCode.HookBindingCommitOutcomeUnknown ||
    error.code === HarnessErrorCode.HookBindingLockReleaseUnknown ||
    error.code === HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown ||
    error.code === HarnessErrorCode.CodingTaskSessionAdmissionLockReleaseUnknown ||
    error.code === HarnessErrorCode.CodingTaskSessionCloseoutCommitOutcomeUnknown ||
    error.code === HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown ||
    error.code === HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown ||
    error.code === HarnessErrorCode.CodingTaskSessionCloseoutRecoveryLockReleaseUnknown ||
    error.code === HarnessErrorCode.CodingTaskSessionCloseoutRecoveryRepositoryLockReleaseUnknown ||
    error.code === HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown ||
    error.code === HarnessErrorCode.CommandGatewayCommitOutcomeUnknown ||
    error.code === HarnessErrorCode.IoFailure
  ) {
    return outcomeUnknownReceipt(command, error.message);
  }
  if (error.code === HarnessErrorCode.LockUnavailable) {
    return unwrapReceipt({
      commandId: command.commandId,
      requestDigest: command.requestDigest,
      status: CommandStatus.Rejected,
      errorCode: CommandErrorCode.ResourceUnavailable,
      errorMessage: error.message,
    });
  }
  return unwrapReceipt({
    commandId: command.commandId,
    requestDigest: command.requestDigest,
    status: CommandStatus.Rejected,
    errorCode:
      error.code === HarnessErrorCode.OperationForbidden
        ? CommandErrorCode.AuthorizationDenied
        : error.code === HarnessErrorCode.PreconditionNotMet
          ? CommandErrorCode.PreconditionNotMet
          : CommandErrorCode.InvalidPayload,
    errorMessage: error.message,
  });
}

function outcomeUnknownReceipt(command: CommandEnvelope, message: string): CommandReceipt {
  return unwrapReceipt({
    commandId: command.commandId,
    requestDigest: command.requestDigest,
    status: CommandStatus.OutcomeUnknown,
    errorCode: CommandErrorCode.OutcomeUnknown,
    errorMessage: message,
  });
}

function unwrapReceipt(input: Parameters<typeof createCommandReceipt>[0]): CommandReceipt {
  const receipt = createCommandReceipt(input);
  if (receipt.status === ResultStatus.Failure) {
    throw receipt.error;
  }
  return receipt.value;
}
