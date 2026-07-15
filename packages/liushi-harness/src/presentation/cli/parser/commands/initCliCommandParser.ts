import {
  CliCommand,
  type CliOutputFormat,
  type InitDryRunCliCommand,
} from "../../contracts/index.js";
import type { CollectedCliArguments } from "../collection/index.js";
import {
  CliOptionName,
  createInvalidCliOptionError,
  parseAbsolutePath,
  parseCliInstallationTarget,
} from "../options/index.js";
import {
  isExactCliCommand,
  requireCliOptionValue,
  validateAllowedCliOptions,
} from "./cliCommandParsing.js";
import { DEFAULT_CLI_ACTOR_ID } from "../../constants/index.js";

/** 解析仅支持 --dry-run 的 G0 Managed Files init 命令。 */
export function parseInitCliCommand(
  collected: CollectedCliArguments,
  outputFormat: CliOutputFormat,
  storeRoot: string | undefined,
): InitDryRunCliCommand | undefined {
  if (!isExactCliCommand(collected.positionals, ["init"])) return undefined;
  validateAllowedCliOptions(
    collected,
    new Set([
      CliOptionName.Json,
      CliOptionName.Store,
      CliOptionName.Target,
      CliOptionName.Root,
      CliOptionName.Workspace,
      CliOptionName.Repository,
      CliOptionName.DryRun,
      CliOptionName.ActorId,
    ]),
  );
  if (!collected.flags.has(CliOptionName.DryRun)) {
    throw createInvalidCliOptionError(
      CliOptionName.DryRun,
      "Managed file installation currently requires --dry-run.",
    );
  }
  return {
    command: CliCommand.InitDryRun,
    outputFormat,
    ...(storeRoot === undefined ? {} : { storeRoot }),
    target: parseCliInstallationTarget(requireCliOptionValue(collected, CliOptionName.Target)),
    root: parseAbsolutePath(
      requireCliOptionValue(collected, CliOptionName.Root),
      CliOptionName.Root,
    ),
    workspaceId: requireCliOptionValue(collected, CliOptionName.Workspace),
    repositoryId: requireCliOptionValue(collected, CliOptionName.Repository),
    dryRun: true,
    actorId: collected.values.get(CliOptionName.ActorId) ?? DEFAULT_CLI_ACTOR_ID,
  };
}
