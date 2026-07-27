import { isRuleResolutionBlocked } from "#application/index.js";
import { ResultStatus } from "#common/index.js";

import type {
  CliApplication,
  ProfileCompileCliCommand,
  RulesResolveCliCommand,
  RunCliDependencies,
} from "../../../contracts/index.js";
import { CLI_EXIT_CODE_CONFLICT } from "../../../constants/index.js";
import {
  CLI_EXIT_CODE_SUCCESS,
  mapErrorExitCode,
  writeBlocked,
  writeFailure,
  writeSuccess,
} from "../../../output/index.js";

/** 读取 Rule Catalog 与上下文并输出确定性解析结果。 */
export async function executeRulesResolve(
  command: RulesResolveCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const catalog = await dependencies.jsonDocumentReader.read(command.catalogFilePath);
  if (catalog.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, catalog.error);
    return mapErrorExitCode(catalog.error.code);
  }
  const context = await dependencies.jsonDocumentReader.read(command.contextFilePath);
  if (context.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, context.error);
    return mapErrorExitCode(context.error.code);
  }
  const result = application.resolveRules.execute({
    catalog: catalog.value,
    context: context.value,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (isRuleResolutionBlocked(result.value)) {
    writeBlocked(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_CONFLICT;
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

/** 读取已批准的 Project Discovery Report 并编译 Profile。 */
export async function executeProfileCompile(
  command: ProfileCompileCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const document = await dependencies.jsonDocumentReader.read(command.reportFilePath);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const result = await application.compileProjectProfile.execute({
    workspaceId: command.workspaceId,
    taskId: command.taskId,
    artifactId: command.artifactId,
    report: document.value,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}
