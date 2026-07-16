import { ResultStatus } from "#common/index.js";

import type {
  CliApplication,
  DoctorCliCommand,
  RunCliDependencies,
} from "../../contracts/index.js";
import {
  CLI_EXIT_CODE_SUCCESS,
  mapErrorExitCode,
  writeFailure,
  writeSuccess,
} from "../../output/index.js";

/** 执行 Runtime Store 健康检查并映射稳定 CLI 输出。 */
export async function executeDoctor(
  command: DoctorCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.checkRuntimeHealth.execute();
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}
