import { CodingTaskCellStatus } from "#application/index.js";
import { ResultStatus } from "#common/index.js";

import { CLI_EXIT_CODE_CONFLICT } from "../../constants/index.js";
import type {
  CellRunCliCommand,
  CliApplication,
  RunCliDependencies,
} from "../../contracts/index.js";
import {
  CLI_EXIT_CODE_SUCCESS,
  mapErrorExitCode,
  writeBlocked,
  writeFailure,
  writeSuccess,
} from "../../output/index.js";

/** 读取严格 Cell Manifest 并执行单一 CodingTask 纵向切片。 */
export async function executeCellRun(
  command: CellRunCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const manifest = await dependencies.jsonDocumentReader.read(command.filePath);
  if (manifest.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, manifest.error);
    return mapErrorExitCode(manifest.error.code);
  }
  const result = await application.runCodingTaskCell.execute(manifest.value);
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (result.value.status !== CodingTaskCellStatus.ReviewReady) {
    writeBlocked(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_CONFLICT;
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}
