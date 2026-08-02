import type { CliOutputFormat, RequirementAnalyzeCliCommand } from "../../contracts/index.js";
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
): RequirementAnalyzeCliCommand | undefined {
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
