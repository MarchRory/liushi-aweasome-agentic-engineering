import {
  COMMAND_RECEIPT_SCHEMA_VERSION,
  CommandReservationDisposition,
  CommandStatus,
  createCommandReceipt,
  type CommandErrorCode,
  type CommandEnvelope,
  type CommandReceipt,
  type CommandReservation,
} from "#application/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";

/** 构造非 Committed Receipt 时允许提供的可选字段。 */
interface ResolvedReceiptFields {
  /** 稳定错误分类。 */
  readonly errorCode?: CommandErrorCode;
  /** 非敏感错误说明。 */
  readonly errorMessage?: string;
  /** Duplicate 对应的首次 Command ID。 */
  readonly duplicateOfCommandId?: string;
}

/** 将同一幂等作用域内已有 Owner Receipt 映射为当前 Command 的封闭结果。 */
export function resolvePriorCommandReceipt(
  command: CommandEnvelope,
  ownerCommandId: string,
  receipt: CommandReceipt,
): CommandReservation {
  switch (receipt.status) {
    case CommandStatus.Committed:
      return createResolvedCommandReservation(command, CommandStatus.Duplicate, {
        duplicateOfCommandId: ownerCommandId,
      });
    case CommandStatus.Rejected:
    case CommandStatus.Conflict:
    case CommandStatus.OutcomeUnknown:
      return createResolvedCommandReservation(command, receipt.status, {
        ...(receipt.errorCode === undefined ? {} : { errorCode: receipt.errorCode }),
        ...(receipt.errorMessage === undefined ? {} : { errorMessage: receipt.errorMessage }),
      });
    case CommandStatus.Duplicate:
      throw new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Command Reservation Owner 不能持久化 Duplicate Receipt。",
      );
  }
}

/** 使用当前 Command 身份构造已解析的 Reservation。 */
export function createResolvedCommandReservation(
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
