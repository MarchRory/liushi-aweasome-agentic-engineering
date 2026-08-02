import type {
  CliOutputFormat,
  RequirementAnalyzeCliCommand,
  RequirementConfirmCliCommand,
} from "../../contracts/index.js";
import { CliCommand } from "../../contracts/index.js";
import type { CollectedCliArguments } from "../collection/index.js";
import {
  CliOptionName,
  parseAbsolutePath,
  parseModelId,
  parseProbeExecutable,
} from "../options/index.js";
import {
  isExactCliCommand,
  requireCliOptionValue,
  validateAllowedCliOptions,
} from "./cliCommandParsing.js";

/** 解析只读 Requirement 分析命令。 */
export function parseRequirementCliCommand(
  collected: CollectedCliArguments,
  outputFormat: CliOutputFormat,
  storeRoot: string | undefined,
): RequirementAnalyzeCliCommand | RequirementConfirmCliCommand | undefined {
  if (isExactCliCommand(collected.positionals, ["requirement", "confirm"])) {
    validateAllowedCliOptions(
      collected,
      new Set([
        CliOptionName.Json,
        CliOptionName.Store,
        CliOptionName.Workspace,
        CliOptionName.Task,
        CliOptionName.Repository,
        CliOptionName.File,
        CliOptionName.ActorId,
      ]),
    );
    return {
      command: CliCommand.RequirementConfirm,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      workspaceId: requireCliOptionValue(collected, CliOptionName.Workspace),
      taskId: requireCliOptionValue(collected, CliOptionName.Task),
      repositoryId: requireCliOptionValue(collected, CliOptionName.Repository),
      filePath: requireCliOptionValue(collected, CliOptionName.File),
      actorId: requireCliOptionValue(collected, CliOptionName.ActorId),
    };
  }
  if (!isExactCliCommand(collected.positionals, ["requirement", "analyze"])) return undefined;

  validateAllowedCliOptions(
    collected,
    new Set([
      CliOptionName.Json,
      CliOptionName.Workspace,
      CliOptionName.Repository,
      CliOptionName.Root,
      CliOptionName.Prd,
      CliOptionName.Executable,
      CliOptionName.Model,
    ]),
  );
  return {
    command: CliCommand.RequirementAnalyze,
    outputFormat,
    workspaceId: requireCliOptionValue(collected, CliOptionName.Workspace),
    repositoryId: requireCliOptionValue(collected, CliOptionName.Repository),
    repositoryRoot: parseAbsolutePath(
      requireCliOptionValue(collected, CliOptionName.Root),
      CliOptionName.Root,
    ),
    prdFilePath: parseAbsolutePath(
      requireCliOptionValue(collected, CliOptionName.Prd),
      CliOptionName.Prd,
    ),
    executable: parseProbeExecutable(collected.values.get(CliOptionName.Executable) ?? "codex"),
    model: parseModelId(requireCliOptionValue(collected, CliOptionName.Model)),
  };
}
