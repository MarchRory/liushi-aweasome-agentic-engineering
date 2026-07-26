import {
  CliCommand,
  type CodingTaskSessionActivateCliCommand,
  type CodingTaskSessionCloseoutCliCommand,
  type CliOutputFormat,
} from "../../contracts/index.js";
import type { CollectedCliArguments } from "../collection/index.js";
import { CliOptionName, parseAbsolutePath } from "../options/index.js";
import {
  isExactCliCommand,
  requireCliOptionValue,
  validateAllowedCliOptions,
} from "./cliCommandParsing.js";

/** 解析 coding-task session 命令族；不匹配时返回 undefined。 */
export function parseCodingTaskSessionCliCommand(
  collected: CollectedCliArguments,
  outputFormat: CliOutputFormat,
  storeRoot: string | undefined,
): CodingTaskSessionActivateCliCommand | CodingTaskSessionCloseoutCliCommand | undefined {
  const command = parseCodingTaskSessionCommandName(collected);
  if (command === undefined) return undefined;
  validateAllowedCliOptions(
    collected,
    new Set([
      CliOptionName.Json,
      CliOptionName.Store,
      CliOptionName.File,
      CliOptionName.Workspace,
      CliOptionName.Repository,
      CliOptionName.Root,
      CliOptionName.ActorId,
    ]),
  );
  return {
    command,
    outputFormat,
    ...(storeRoot === undefined ? {} : { storeRoot }),
    filePath: requireCliOptionValue(collected, CliOptionName.File),
    workspaceId: requireCliOptionValue(collected, CliOptionName.Workspace),
    repositoryId: requireCliOptionValue(collected, CliOptionName.Repository),
    repositoryRoot: parseAbsolutePath(
      requireCliOptionValue(collected, CliOptionName.Root),
      CliOptionName.Root,
    ),
    actorId: requireCliOptionValue(collected, CliOptionName.ActorId),
  };
}

function parseCodingTaskSessionCommandName(
  collected: CollectedCliArguments,
): CliCommand.CodingTaskSessionActivate | CliCommand.CodingTaskSessionCloseout | undefined {
  if (isExactCliCommand(collected.positionals, ["coding-task", "session", "activate"])) {
    return CliCommand.CodingTaskSessionActivate;
  }
  if (isExactCliCommand(collected.positionals, ["coding-task", "session", "closeout"])) {
    return CliCommand.CodingTaskSessionCloseout;
  }
  return undefined;
}
