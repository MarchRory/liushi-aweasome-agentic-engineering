import {
  CliCommand,
  type CliOutputFormat,
  type InitApplyCliCommand,
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
): InitDryRunCliCommand | InitApplyCliCommand | undefined {
  if (!isExactCliCommand(collected.positionals, ["init"])) return undefined;
  const dryRun = collected.flags.has(CliOptionName.DryRun);
  const applyPlanId = collected.values.get(CliOptionName.Apply);
  if (dryRun === (applyPlanId !== undefined))
    throw createInvalidCliOptionError(
      CliOptionName.Apply,
      "Init requires exactly one of --dry-run or --apply <planId>.",
    );
  if (applyPlanId !== undefined) {
    validateAllowedCliOptions(
      collected,
      new Set([
        CliOptionName.Json,
        CliOptionName.Store,
        CliOptionName.Apply,
        CliOptionName.PlanDigest,
        CliOptionName.Workspace,
        CliOptionName.Repository,
        CliOptionName.ActorId,
        CliOptionName.IdempotencyKey,
      ]),
    );
    return {
      command: CliCommand.InitApply,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      workspaceId: requireCliOptionValue(collected, CliOptionName.Workspace),
      repositoryId: requireCliOptionValue(collected, CliOptionName.Repository),
      planId: applyPlanId,
      planDigest: requireCliOptionValue(collected, CliOptionName.PlanDigest),
      actorId: requireCliOptionValue(collected, CliOptionName.ActorId),
      idempotencyKey: requireCliOptionValue(collected, CliOptionName.IdempotencyKey),
    };
  }
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
