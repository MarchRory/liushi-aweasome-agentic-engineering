import { CodingTaskSessionActivationStatus } from "#application/index.js";
import { ResultStatus } from "#common/index.js";

import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_OUTCOME_UNKNOWN,
  CLI_EXIT_CODE_SUCCESS,
} from "../../constants/index.js";
import type {
  CliApplication,
  CodingTaskSessionActivateCliCommand,
  RunCliDependencies,
} from "../../contracts/index.js";
import { mapErrorExitCode, writeBlocked, writeFailure, writeSuccess } from "../../output/index.js";

/** 读取严格 Activation Manifest，并停在外部 Agent 启动边界。 */
export async function executeCodingTaskSessionActivate(
  command: CodingTaskSessionActivateCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const manifest = await dependencies.jsonDocumentReader.read(command.filePath);
  if (manifest.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, manifest.error);
    return mapErrorExitCode(manifest.error.code);
  }
  const result = await application.activateCodingTaskSession.execute(manifest.value);
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (result.value.status === CodingTaskSessionActivationStatus.WaitingAgent) {
    writeSuccess(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_SUCCESS;
  }
  writeBlocked(dependencies, command.outputFormat, command.command, result.value);
  return result.value.status === CodingTaskSessionActivationStatus.OutcomeUnknown
    ? CLI_EXIT_CODE_OUTCOME_UNKNOWN
    : CLI_EXIT_CODE_CONFLICT;
}
