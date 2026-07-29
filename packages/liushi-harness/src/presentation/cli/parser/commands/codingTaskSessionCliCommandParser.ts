import {
  CliCommand,
  type CodingTaskSessionActivateCliCommand,
  type CodingTaskSessionCloseoutRecoveryAssessCliCommand,
  type CodingTaskSessionCloseoutRecoverCliCommand,
  type CodingTaskSessionEffectiveCloseoutCliCommand,
  type CodingTaskSessionCloseoutCliCommand,
  type CodingTaskSessionCompleteCliCommand,
  type CliOutputFormat,
} from "../../contracts/index.js";
import type { CollectedCliArguments } from "../collection/index.js";
import { CliOptionName, parseAbsolutePath, parseCliVerificationMode } from "../options/index.js";
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
):
  | CodingTaskSessionActivateCliCommand
  | CodingTaskSessionCloseoutCliCommand
  | CodingTaskSessionCompleteCliCommand
  | CodingTaskSessionCloseoutRecoveryAssessCliCommand
  | CodingTaskSessionCloseoutRecoverCliCommand
  | CodingTaskSessionEffectiveCloseoutCliCommand
  | undefined {
  const command = parseCodingTaskSessionCommandName(collected);
  if (command === undefined) return undefined;
  switch (command) {
    case CliCommand.CodingTaskSessionEffectiveCloseout:
      validateAllowedCliOptions(
        collected,
        new Set([
          CliOptionName.Json,
          CliOptionName.Store,
          CliOptionName.Workspace,
          CliOptionName.Session,
        ]),
      );
      return {
        command,
        outputFormat,
        ...(storeRoot === undefined ? {} : { storeRoot }),
        workspaceId: requireCliOptionValue(collected, CliOptionName.Workspace),
        sessionId: requireCliOptionValue(collected, CliOptionName.Session),
      };
    case CliCommand.CodingTaskSessionCloseoutRecoveryAssess:
      validateAllowedCliOptions(
        collected,
        new Set([
          CliOptionName.Json,
          CliOptionName.Store,
          CliOptionName.Workspace,
          CliOptionName.Session,
          CliOptionName.Repository,
          CliOptionName.Root,
        ]),
      );
      return {
        command,
        outputFormat,
        ...(storeRoot === undefined ? {} : { storeRoot }),
        workspaceId: requireCliOptionValue(collected, CliOptionName.Workspace),
        sessionId: requireCliOptionValue(collected, CliOptionName.Session),
        repositoryId: requireCliOptionValue(collected, CliOptionName.Repository),
        repositoryRoot: parseAbsolutePath(
          requireCliOptionValue(collected, CliOptionName.Root),
          CliOptionName.Root,
        ),
      };
    case CliCommand.CodingTaskSessionCloseoutRecover:
      validateAllowedCliOptions(
        collected,
        new Set([
          CliOptionName.Json,
          CliOptionName.Store,
          CliOptionName.File,
          CliOptionName.Workspace,
          CliOptionName.Session,
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
        sessionId: requireCliOptionValue(collected, CliOptionName.Session),
        repositoryId: requireCliOptionValue(collected, CliOptionName.Repository),
        repositoryRoot: parseAbsolutePath(
          requireCliOptionValue(collected, CliOptionName.Root),
          CliOptionName.Root,
        ),
        actorId: requireCliOptionValue(collected, CliOptionName.ActorId),
      };
    case CliCommand.CodingTaskSessionActivate:
    case CliCommand.CodingTaskSessionCloseout:
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
    case CliCommand.CodingTaskSessionComplete:
      validateAllowedCliOptions(
        collected,
        new Set([
          CliOptionName.Json,
          CliOptionName.Store,
          CliOptionName.File,
          CliOptionName.Workspace,
          CliOptionName.Session,
          CliOptionName.Repository,
          CliOptionName.Root,
          CliOptionName.ActorId,
          CliOptionName.VerificationMode,
        ]),
      );
      return {
        command,
        outputFormat,
        ...(storeRoot === undefined ? {} : { storeRoot }),
        filePath: requireCliOptionValue(collected, CliOptionName.File),
        workspaceId: requireCliOptionValue(collected, CliOptionName.Workspace),
        sessionId: requireCliOptionValue(collected, CliOptionName.Session),
        repositoryId: requireCliOptionValue(collected, CliOptionName.Repository),
        repositoryRoot: parseAbsolutePath(
          requireCliOptionValue(collected, CliOptionName.Root),
          CliOptionName.Root,
        ),
        actorId: requireCliOptionValue(collected, CliOptionName.ActorId),
        verificationMode: parseCliVerificationMode(
          requireCliOptionValue(collected, CliOptionName.VerificationMode),
        ),
      };
  }
}

function parseCodingTaskSessionCommandName(
  collected: CollectedCliArguments,
):
  | CliCommand.CodingTaskSessionActivate
  | CliCommand.CodingTaskSessionCloseout
  | CliCommand.CodingTaskSessionCloseoutRecoveryAssess
  | CliCommand.CodingTaskSessionCloseoutRecover
  | CliCommand.CodingTaskSessionEffectiveCloseout
  | CliCommand.CodingTaskSessionComplete
  | undefined {
  if (isExactCliCommand(collected.positionals, ["coding-task", "session", "activate"])) {
    return CliCommand.CodingTaskSessionActivate;
  }
  if (isExactCliCommand(collected.positionals, ["coding-task", "session", "closeout"])) {
    return CliCommand.CodingTaskSessionCloseout;
  }
  if (isExactCliCommand(collected.positionals, ["coding-task", "session", "complete"])) {
    return CliCommand.CodingTaskSessionComplete;
  }
  if (isExactCliCommand(collected.positionals, ["coding-task", "session", "closeout", "assess"])) {
    return CliCommand.CodingTaskSessionCloseoutRecoveryAssess;
  }
  if (isExactCliCommand(collected.positionals, ["coding-task", "session", "closeout", "recover"])) {
    return CliCommand.CodingTaskSessionCloseoutRecover;
  }
  if (
    isExactCliCommand(collected.positionals, ["coding-task", "session", "closeout", "effective"])
  ) {
    return CliCommand.CodingTaskSessionEffectiveCloseout;
  }
  return undefined;
}
