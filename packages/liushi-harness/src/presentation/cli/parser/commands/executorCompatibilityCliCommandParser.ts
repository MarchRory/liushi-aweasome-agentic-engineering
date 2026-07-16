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
  type ExecutorCompatibilityBundleCreateCliCommand,
  type ExecutorCompatibilityCompileCliCommand,
  type ExecutorCompatibilityQueryCliCommand,
} from "../../contracts/index.js";
import type { CliOutputFormat } from "../../contracts/index.js";
import type { CollectedCliArguments } from "../collection/index.js";
import { CliOptionName, createInvalidCliOptionError, parseAbsolutePath } from "../options/index.js";
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
):
  | ExecutorCompatibilityCompileCliCommand
  | ExecutorCompatibilityQueryCliCommand
  | ExecutorCompatibilityBundleCreateCliCommand
  | undefined {
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
  if (isExactCliCommand(collected.positionals, ["executor", "compatibility", "bundle", "create"])) {
    validateAllowedCliOptions(
      collected,
      new Set([
        CliOptionName.Json,
        CliOptionName.Store,
        CliOptionName.MatrixDigest,
        CliOptionName.PackageName,
        CliOptionName.PackageVersion,
        CliOptionName.PackageDigest,
        CliOptionName.RepositoryUri,
        CliOptionName.SourceRevision,
        CliOptionName.Output,
      ]),
    );
    return {
      command: CliCommand.ExecutorCompatibilityBundleCreate,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      matrixDigest: parseMatrixDigest(requireCliOptionValue(collected, CliOptionName.MatrixDigest)),
      packageName: requireCliOptionValue(collected, CliOptionName.PackageName),
      packageVersion: requireCliOptionValue(collected, CliOptionName.PackageVersion),
      packageDigest: parsePackageDigest(
        requireCliOptionValue(collected, CliOptionName.PackageDigest),
      ),
      repositoryUri: requireCliOptionValue(collected, CliOptionName.RepositoryUri),
      sourceRevision: requireCliOptionValue(collected, CliOptionName.SourceRevision),
      outputFilePath: parseAbsolutePath(
        requireCliOptionValue(collected, CliOptionName.Output),
        CliOptionName.Output,
      ),
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
  return parseDigestOption(
    value,
    CliOptionName.MatrixDigest,
    "Matrix digest must use sha256:<64 lowercase hex> format.",
  );
}

function parsePackageDigest(value: string): ContentDigest {
  return parseDigestOption(
    value,
    CliOptionName.PackageDigest,
    "Package digest must use sha256:<64 lowercase hex> format.",
  );
}

function parseDigestOption(value: string, option: CliOptionName, message: string): ContentDigest {
  const digest = parseContentDigest(value);
  if (digest.status === ResultStatus.Failure) {
    throw createInvalidCliOptionError(option, message);
  }
  return digest.value;
}
