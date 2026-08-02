import type {
  CliOutputFormat,
  PlanRiskAnalyzeCliCommand,
  PlanRiskConfirmCliCommand,
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

/** 解析 PlanRisk 分析与 Human 确认命令。 */
export function parsePlanRiskCliCommand(
  collected: CollectedCliArguments,
  outputFormat: CliOutputFormat,
  storeRoot: string | undefined,
): PlanRiskAnalyzeCliCommand | PlanRiskConfirmCliCommand | undefined {
  if (isExactCliCommand(collected.positionals, ["plan-risk", "confirm"])) {
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
      command: CliCommand.PlanRiskConfirm,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      workspaceId: requireCliOptionValue(collected, CliOptionName.Workspace),
      taskId: requireCliOptionValue(collected, CliOptionName.Task),
      repositoryId: requireCliOptionValue(collected, CliOptionName.Repository),
      filePath: requireCliOptionValue(collected, CliOptionName.File),
      actorId: requireCliOptionValue(collected, CliOptionName.ActorId),
    };
  }
  if (!isExactCliCommand(collected.positionals, ["plan-risk", "analyze"])) return undefined;

  validateAllowedCliOptions(
    collected,
    new Set([
      CliOptionName.Json,
      CliOptionName.Store,
      CliOptionName.Workspace,
      CliOptionName.Task,
      CliOptionName.Repository,
      CliOptionName.Root,
      CliOptionName.Executable,
      CliOptionName.Model,
    ]),
  );
  return {
    command: CliCommand.PlanRiskAnalyze,
    outputFormat,
    ...(storeRoot === undefined ? {} : { storeRoot }),
    workspaceId: requireCliOptionValue(collected, CliOptionName.Workspace),
    taskId: requireCliOptionValue(collected, CliOptionName.Task),
    repositoryId: requireCliOptionValue(collected, CliOptionName.Repository),
    repositoryRoot: parseAbsolutePath(
      requireCliOptionValue(collected, CliOptionName.Root),
      CliOptionName.Root,
    ),
    executable: parseProbeExecutable(collected.values.get(CliOptionName.Executable) ?? "codex"),
    model: parseModelId(requireCliOptionValue(collected, CliOptionName.Model)),
  };
}
