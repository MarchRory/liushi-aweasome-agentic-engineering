import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";

import type {
  ExecutorCompatibilityCompileCliCommand,
  ExecutorCompatibilityQueryCliCommand,
  RunCliDependencies,
} from "../../contracts/index.js";
import { CliCommand, CliOutputFormat } from "../../contracts/index.js";
import {
  CLI_EXIT_CODE_SUCCESS,
  mapErrorExitCode,
  writeFailure,
  writeSuccess,
} from "../../output/index.js";
import { writeExecutorCompatibilitySummary } from "../../output/summary/index.js";

/** 读取完成后才可交给 Application 的三份原始 JSON 文档。 */
interface ExecutorCompatibilityRawDocuments {
  readonly prepareManifest: unknown;
  readonly activationPlan: unknown;
  readonly hostResult: unknown;
}

/** 在独立子模块中执行已解析的 Executor Compatibility 命令。 */
export async function executeExecutorCompatibilityCommand(
  command: ExecutorCompatibilityCompileCliCommand | ExecutorCompatibilityQueryCliCommand,
  dependencies: RunCliDependencies,
): Promise<number> {
  if (command.command === CliCommand.ExecutorCompatibilityCompile) {
    return executeCompile(command, dependencies);
  }
  return executeQuery(command, dependencies);
}

async function executeCompile(
  command: ExecutorCompatibilityCompileCliCommand,
  dependencies: RunCliDependencies,
): Promise<number> {
  const documents = await readRawDocuments(command, dependencies);
  if (documents.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, documents.error);
    return mapErrorExitCode(documents.error.code);
  }

  const application = dependencies.applicationFactory.create(
    command.storeRoot ?? dependencies.defaultStoreRoot,
  );
  const result = await application.compileCodexExecutorCompatibility.execute(documents.value);
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeResult(command, dependencies, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

async function executeQuery(
  command: ExecutorCompatibilityQueryCliCommand,
  dependencies: RunCliDependencies,
): Promise<number> {
  const application = dependencies.applicationFactory.create(
    command.storeRoot ?? dependencies.defaultStoreRoot,
  );
  const result = await application.queryExecutorCompatibility.execute(command.matrixDigest);
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeResult(command, dependencies, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

async function readRawDocuments(
  command: ExecutorCompatibilityCompileCliCommand,
  dependencies: RunCliDependencies,
): Promise<Result<ExecutorCompatibilityRawDocuments, HarnessError>> {
  const prepare = await dependencies.jsonDocumentReader.read(command.prepareFilePath);
  if (prepare.status === ResultStatus.Failure) return prepare;
  const activation = await dependencies.jsonDocumentReader.read(command.activationFilePath);
  if (activation.status === ResultStatus.Failure) return activation;
  const hostResult = await dependencies.jsonDocumentReader.read(command.resultFilePath);
  if (hostResult.status === ResultStatus.Failure) return hostResult;
  return success({
    prepareManifest: prepare.value,
    activationPlan: activation.value,
    hostResult: hostResult.value,
  });
}

function writeResult(
  command: ExecutorCompatibilityCompileCliCommand | ExecutorCompatibilityQueryCliCommand,
  dependencies: RunCliDependencies,
  data: unknown,
): void {
  if (command.outputFormat === CliOutputFormat.Json) {
    writeSuccess(dependencies, command.outputFormat, command.command, data);
    return;
  }
  writeExecutorCompatibilitySummary(dependencies.writer, command.command, data);
}
