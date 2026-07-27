import {
  CodingTaskSessionCloseoutRecoveryDisposition,
  CodingTaskSessionEffectiveCloseoutStatus,
} from "#application/codingTaskSessionCloseoutRecovery/index.js";
import { CommandErrorCode, CommandStatus } from "#application/command/index.js";
import { ResultStatus } from "#common/index.js";
import type { CliApplication, RunCliDependencies } from "#presentation/cli/contracts/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_OUTCOME_UNKNOWN,
  CLI_EXIT_CODE_UNAVAILABLE,
  CLI_EXIT_CODE_SUCCESS,
} from "#presentation/cli/constants/index.js";
import {
  mapErrorExitCode,
  writeBlocked,
  writeFailure,
  writeSuccess,
} from "#presentation/cli/output/index.js";
import type {
  CodingTaskSessionCloseoutRecoveryAssessCliCommand,
  CodingTaskSessionCloseoutRecoveryRecoverCliCommand,
  CodingTaskSessionEffectiveCloseoutCliCommand,
} from "../types/index.js";
import { validateCodingTaskSessionCloseoutRecoveryCliBinding } from "../validation/index.js";

/** 执行只读 Closeout Recovery Assessment 并映射稳定退出码。 */
export async function executeCodingTaskSessionCloseoutRecoveryAssess(
  command: CodingTaskSessionCloseoutRecoveryAssessCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.assessCodingTaskSessionCloseoutRecovery.execute({
    workspaceId: command.workspaceId,
    sessionId: command.sessionId,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (
    result.value.disposition === CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable
  ) {
    writeSuccess(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_SUCCESS;
  }
  writeBlocked(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_CONFLICT;
}

/** 解析下游可消费的 Effective Closeout 并映射稳定退出码。 */
export async function executeCodingTaskSessionEffectiveCloseout(
  command: CodingTaskSessionEffectiveCloseoutCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.resolveCodingTaskSessionEffectiveCloseout.resolve({
    workspaceId: command.workspaceId,
    sessionId: command.sessionId,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (result.value.status === CodingTaskSessionEffectiveCloseoutStatus.Resolved) {
    writeSuccess(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_SUCCESS;
  }
  writeBlocked(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_CONFLICT;
}

/** 读取并执行完整 Human Recovery Command，禁止从 CLI 直接写入恢复状态。 */
export async function executeCodingTaskSessionCloseoutRecoveryRecover(
  command: CodingTaskSessionCloseoutRecoveryRecoverCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const document = await dependencies.jsonDocumentReader.read(command.filePath);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }

  const bindingError = validateCodingTaskSessionCloseoutRecoveryCliBinding(command, document.value);
  if (bindingError !== null) {
    writeFailure(dependencies, command.outputFormat, command.command, bindingError);
    return mapErrorExitCode(bindingError.code);
  }

  const result = await application.recoverCodingTaskSessionCloseout.execute(document.value);
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  return writeCodingTaskSessionCloseoutRecoveryReceipt(command, dependencies, result.value);
}

function writeCodingTaskSessionCloseoutRecoveryReceipt(
  command: CodingTaskSessionCloseoutRecoveryRecoverCliCommand,
  dependencies: RunCliDependencies,
  receipt: {
    readonly status: CommandStatus;
    readonly errorCode?: CommandErrorCode;
  },
): number {
  switch (receipt.status) {
    case CommandStatus.Committed:
    case CommandStatus.Duplicate:
      writeSuccess(dependencies, command.outputFormat, command.command, receipt);
      return CLI_EXIT_CODE_SUCCESS;
    case CommandStatus.OutcomeUnknown:
      writeBlocked(dependencies, command.outputFormat, command.command, receipt);
      return CLI_EXIT_CODE_OUTCOME_UNKNOWN;
    case CommandStatus.Rejected:
      writeBlocked(dependencies, command.outputFormat, command.command, receipt);
      return receipt.errorCode === CommandErrorCode.ResourceUnavailable
        ? CLI_EXIT_CODE_UNAVAILABLE
        : CLI_EXIT_CODE_CONFLICT;
    case CommandStatus.Conflict:
      writeBlocked(dependencies, command.outputFormat, command.command, receipt);
      return CLI_EXIT_CODE_CONFLICT;
  }
}
