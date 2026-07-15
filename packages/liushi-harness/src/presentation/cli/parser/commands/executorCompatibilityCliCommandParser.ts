import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  parseContentDigest,
  type ContentDigest,
} from "#common/index.js";

import {
  CliCommand,
  CliExecutorCompatibilityExecutor,
  type ExecutorCompatibilityCompileCliCommand,
  type ExecutorCompatibilityQueryCliCommand,
} from "../../contracts/index.js";
import type { CliOutputFormat } from "../../contracts/index.js";
import type { CollectedCliArguments } from "../collection/index.js";
import { CliOptionName, createInvalidCliOptionError } from "../options/index.js";
import {
  isExactCliCommand,
  requireCliOptionValue,
  validateAllowedCliOptions,
} from "./cliCommandParsing.js";

const EXECUTOR_BY_NAME = new Map<string, CliExecutorCompatibilityExecutor>(
  Object.values(CliExecutorCompatibilityExecutor).map((executor) => [executor, executor]),
);

/** 尝试解析固定的 Executor Compatibility CLI 命令。 */
export function parseExecutorCompatibilityCliCommand(
  collected: CollectedCliArguments,
  outputFormat: CliOutputFormat,
  storeRoot: string | undefined,
): ExecutorCompatibilityCompileCliCommand | ExecutorCompatibilityQueryCliCommand | undefined {
  if (isExactCliCommand(collected.positionals, ["executor", "compatibility", "compile"])) {
    validateAllowedCliOptions(
      collected,
      new Set([
        CliOptionName.Json,
        CliOptionName.Store,
        CliOptionName.Executor,
        CliOptionName.Prepare,
        CliOptionName.Activation,
        CliOptionName.Result,
      ]),
    );
    return {
      command: CliCommand.ExecutorCompatibilityCompile,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      executor: parseExecutor(requireCliOptionValue(collected, CliOptionName.Executor)),
      prepareFilePath: requireCliOptionValue(collected, CliOptionName.Prepare),
      activationFilePath: requireCliOptionValue(collected, CliOptionName.Activation),
      resultFilePath: requireCliOptionValue(collected, CliOptionName.Result),
    };
  }
  if (isExactCliCommand(collected.positionals, ["executor", "compatibility", "query"])) {
    validateAllowedCliOptions(
      collected,
      new Set([CliOptionName.Json, CliOptionName.Store, CliOptionName.MatrixDigest]),
    );
    return {
      command: CliCommand.ExecutorCompatibilityQuery,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      matrixDigest: parseMatrixDigest(requireCliOptionValue(collected, CliOptionName.MatrixDigest)),
    };
  }
  return undefined;
}

function parseExecutor(value: string): CliExecutorCompatibilityExecutor {
  const executor = EXECUTOR_BY_NAME.get(value);
  if (executor === undefined) {
    throw new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Executor Compatibility compile only supports Codex.",
      { executor: value },
    );
  }
  return executor;
}

function parseMatrixDigest(value: string): ContentDigest {
  const digest = parseContentDigest(value);
  if (digest.status === ResultStatus.Failure) {
    throw createInvalidCliOptionError(
      CliOptionName.MatrixDigest,
      "Matrix digest must use sha256:<64 lowercase hex> format.",
    );
  }
  return digest.value;
}
