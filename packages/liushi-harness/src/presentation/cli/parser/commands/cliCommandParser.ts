import { HarnessError, HarnessErrorCode } from "#common/index.js";

import { DEFAULT_CLI_ACTOR_ID } from "../../constants/index.js";
import { CliCommand, CliOutputFormat, type ParsedCliCommand } from "../../contracts/index.js";
import type { CollectedCliArguments } from "../collection/index.js";
import {
  CliOptionName,
  createInvalidCliOptionError,
  parseCliApprovalDecision,
} from "../options/index.js";

/** 将已收集参数映射为唯一受支持的语义命令。 */
export function parseCollectedCliArguments(collected: CollectedCliArguments): ParsedCliCommand {
  const outputFormat = collected.flags.has(CliOptionName.Json)
    ? CliOutputFormat.Json
    : CliOutputFormat.Human;
  const storeRoot = collected.values.get(CliOptionName.Store);

  if (
    collected.flags.has(CliOptionName.Help) ||
    collected.positionals.length === 0 ||
    isExactCommand(collected.positionals, ["help"])
  ) {
    validateAllowedOptions(collected, new Set([CliOptionName.Help, CliOptionName.Json]));
    return {
      command: CliCommand.Help,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
    };
  }
  if (isExactCommand(collected.positionals, ["doctor"])) {
    validateAllowedOptions(collected, new Set([CliOptionName.Json, CliOptionName.Store]));
    return {
      command: CliCommand.Doctor,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
    };
  }
  if (isExactCommand(collected.positionals, ["task", "create"])) {
    validateAllowedOptions(
      collected,
      new Set([
        CliOptionName.Json,
        CliOptionName.Store,
        CliOptionName.Workspace,
        CliOptionName.Source,
        CliOptionName.ActorId,
      ]),
    );
    const source = collected.values.get(CliOptionName.Source);
    return {
      command: CliCommand.TaskCreate,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      workspaceId: requireValue(collected, CliOptionName.Workspace),
      ...(source === undefined ? {} : { source }),
      actorId: collected.values.get(CliOptionName.ActorId) ?? DEFAULT_CLI_ACTOR_ID,
    };
  }
  if (isExactCommand(collected.positionals, ["task", "status"])) {
    validateAllowedOptions(
      collected,
      new Set([
        CliOptionName.Json,
        CliOptionName.Store,
        CliOptionName.Workspace,
        CliOptionName.Task,
      ]),
    );
    return {
      command: CliCommand.TaskStatus,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      workspaceId: requireValue(collected, CliOptionName.Workspace),
      taskId: requireValue(collected, CliOptionName.Task),
    };
  }
  if (isExactCommand(collected.positionals, ["artifact", "propose"])) {
    validateAllowedOptions(
      collected,
      new Set([
        CliOptionName.Json,
        CliOptionName.Store,
        CliOptionName.Workspace,
        CliOptionName.Task,
        CliOptionName.File,
        CliOptionName.ActorId,
      ]),
    );
    return {
      command: CliCommand.ArtifactPropose,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      workspaceId: requireValue(collected, CliOptionName.Workspace),
      taskId: requireValue(collected, CliOptionName.Task),
      filePath: requireValue(collected, CliOptionName.File),
      actorId: collected.values.get(CliOptionName.ActorId) ?? DEFAULT_CLI_ACTOR_ID,
    };
  }
  if (isExactCommand(collected.positionals, ["approval", "decide"])) {
    validateAllowedOptions(
      collected,
      new Set([
        CliOptionName.Json,
        CliOptionName.Store,
        CliOptionName.Workspace,
        CliOptionName.Task,
        CliOptionName.Request,
        CliOptionName.RequestDigest,
        CliOptionName.Decision,
        CliOptionName.IdempotencyKey,
        CliOptionName.ActorId,
        CliOptionName.Reason,
      ]),
    );
    const reason = collected.values.get(CliOptionName.Reason);
    return {
      command: CliCommand.ApprovalDecide,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      workspaceId: requireValue(collected, CliOptionName.Workspace),
      taskId: requireValue(collected, CliOptionName.Task),
      decisionRequestId: requireValue(collected, CliOptionName.Request),
      decisionRequestDigest: requireValue(collected, CliOptionName.RequestDigest),
      decision: parseCliApprovalDecision(requireValue(collected, CliOptionName.Decision)),
      idempotencyKey: requireValue(collected, CliOptionName.IdempotencyKey),
      actorId: collected.values.get(CliOptionName.ActorId) ?? DEFAULT_CLI_ACTOR_ID,
      ...(reason === undefined ? {} : { reason }),
    };
  }
  if (isExactCommand(collected.positionals, ["rules", "resolve"])) {
    validateAllowedOptions(
      collected,
      new Set([CliOptionName.Json, CliOptionName.Catalog, CliOptionName.Context]),
    );
    return {
      command: CliCommand.RulesResolve,
      outputFormat,
      catalogFilePath: requireValue(collected, CliOptionName.Catalog),
      contextFilePath: requireValue(collected, CliOptionName.Context),
    };
  }
  throw new HarnessError(HarnessErrorCode.InvalidInput, "Unsupported CLI command.", {
    command: collected.positionals.join(" "),
  });
}

function validateAllowedOptions(
  collected: CollectedCliArguments,
  allowed: ReadonlySet<CliOptionName>,
): void {
  for (const option of [...collected.flags, ...collected.values.keys()]) {
    if (!allowed.has(option)) {
      throw createInvalidCliOptionError(option, "Option is not valid for this command.");
    }
  }
}

function requireValue(collected: CollectedCliArguments, option: CliOptionName): string {
  const value = collected.values.get(option);
  if (value === undefined) {
    throw createInvalidCliOptionError(option, "Required option is missing.");
  }
  return value;
}

function isExactCommand(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}
