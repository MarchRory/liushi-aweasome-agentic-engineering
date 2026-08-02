import { basename } from "node:path";

import { HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";

import type {
  CliApplication,
  RequirementAnalyzeCliCommand,
  RunCliDependencies,
} from "../../contracts/index.js";
import {
  CLI_EXIT_CODE_SUCCESS,
  mapErrorExitCode,
  writeFailure,
  writeSuccess,
} from "../../output/index.js";

/** 读取 PRD 并执行一次无状态、只读 Requirement 分析。 */
export async function executeRequirementAnalyze(
  command: RequirementAnalyzeCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  if (dependencies.textDocumentReader === undefined) {
    const error = new HarnessError(
      HarnessErrorCode.OperationForbidden,
      "CLI host does not provide a text document reader.",
    );
    writeFailure(dependencies, command.outputFormat, command.command, error);
    return mapErrorExitCode(error.code);
  }

  const document = await dependencies.textDocumentReader.read(command.prdFilePath);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const result = await application.analyzeRequirement.execute({
    workspaceId: command.workspaceId,
    repositoryId: command.repositoryId,
    repositoryRoot: command.repositoryRoot,
    prdSource: basename(command.prdFilePath),
    prdContent: document.value,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }

  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}
