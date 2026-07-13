import { isProjectDiscoveryBlocked } from "#application/index.js";
import { ResultStatus } from "#common/index.js";

import { CLI_EXIT_CODE_CONFLICT } from "../../constants/index.js";
import type {
  CliApplication,
  ProjectScanCliCommand,
  RunCliDependencies,
} from "../../contracts/index.js";
import {
  CLI_EXIT_CODE_SUCCESS,
  mapErrorExitCode,
  writeBlocked,
  writeFailure,
  writeSuccess,
} from "../../output/index.js";

/** 读取 Project Scan Manifest 并执行只读项目发现。 */
export async function executeProjectScan(
  command: ProjectScanCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const manifest = await dependencies.jsonDocumentReader.read(command.filePath);
  if (manifest.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, manifest.error);
    return mapErrorExitCode(manifest.error.code);
  }
  const result = await application.scanProject.execute({ manifest: manifest.value });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (isProjectDiscoveryBlocked(result.value)) {
    writeBlocked(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_CONFLICT;
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}
