import { HarnessError, HarnessErrorCode } from "#common/index.js";

import { DEFAULT_CLI_ACTOR_ID } from "../../constants/index.js";
import { CliCommand, CliOutputFormat, type ParsedCliCommand } from "../../contracts/index.js";
import type { CollectedCliArguments } from "../collection/index.js";
import {
  isExactCliCommand as isExactCommand,
  requireCliOptionValue as requireValue,
  validateAllowedCliOptions as validateAllowedOptions,
} from "./cliCommandParsing.js";
import { parseInitCliCommand } from "./initCliCommandParser.js";
import { parseExecutorCompatibilityCliCommand } from "./executorCompatibilityCliCommandParser.js";
import { parseCodingTaskSessionCliCommand } from "./codingTaskSessionCliCommandParser.js";
import { parseRequirementCliCommand } from "./requirementCliCommandParser.js";
import {
  CliOptionName,
  parseAbsolutePath,
  parseCliApprovalDecision,
  parseCliVerificationMode,
  parseHookExecutor,
  parseProbeExecutable,
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
  const init = parseInitCliCommand(collected, outputFormat, storeRoot);
  if (init !== undefined) return init;
  const executorCompatibility = parseExecutorCompatibilityCliCommand(
    collected,
    outputFormat,
    storeRoot,
  );
  if (executorCompatibility !== undefined) return executorCompatibility;
  const codingTaskSession = parseCodingTaskSessionCliCommand(collected, outputFormat, storeRoot);
  if (codingTaskSession !== undefined) return codingTaskSession;
  const requirement = parseRequirementCliCommand(collected, outputFormat);
  if (requirement !== undefined) return requirement;
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
        CliOptionName.IdempotencyKey,
      ]),
    );
    const idempotencyKey = collected.values.get(CliOptionName.IdempotencyKey);
    return {
      command: CliCommand.ArtifactPropose,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      workspaceId: requireValue(collected, CliOptionName.Workspace),
      taskId: requireValue(collected, CliOptionName.Task),
      filePath: requireValue(collected, CliOptionName.File),
      actorId: collected.values.get(CliOptionName.ActorId) ?? DEFAULT_CLI_ACTOR_ID,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
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
  if (isExactCommand(collected.positionals, ["project", "scan"])) {
    validateAllowedOptions(collected, new Set([CliOptionName.Json, CliOptionName.File]));
    return {
      command: CliCommand.ProjectScan,
      outputFormat,
      filePath: requireValue(collected, CliOptionName.File),
    };
  }
  if (isExactCommand(collected.positionals, ["profile", "compile"])) {
    validateAllowedOptions(
      collected,
      new Set([
        CliOptionName.Json,
        CliOptionName.Store,
        CliOptionName.Workspace,
        CliOptionName.Task,
        CliOptionName.Artifact,
        CliOptionName.Report,
      ]),
    );
    return {
      command: CliCommand.ProfileCompile,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      workspaceId: requireValue(collected, CliOptionName.Workspace),
      taskId: requireValue(collected, CliOptionName.Task),
      artifactId: requireValue(collected, CliOptionName.Artifact),
      reportFilePath: requireValue(collected, CliOptionName.Report),
    };
  }
  if (isExactCommand(collected.positionals, ["cell", "run"])) {
    validateAllowedOptions(
      collected,
      new Set([
        CliOptionName.Json,
        CliOptionName.Store,
        CliOptionName.File,
        CliOptionName.Workspace,
        CliOptionName.Repository,
        CliOptionName.Root,
        CliOptionName.VerificationMode,
      ]),
    );
    return {
      command: CliCommand.CellRun,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      filePath: requireValue(collected, CliOptionName.File),
      workspaceId: requireValue(collected, CliOptionName.Workspace),
      repositoryId: requireValue(collected, CliOptionName.Repository),
      repositoryRoot: parseAbsolutePath(
        requireValue(collected, CliOptionName.Root),
        CliOptionName.Root,
      ),
      verificationMode: parseCliVerificationMode(
        requireValue(collected, CliOptionName.VerificationMode),
      ),
    };
  }
  if (isExactCommand(collected.positionals, ["hook", "bind"])) {
    validateAllowedOptions(
      collected,
      new Set([
        CliOptionName.Json,
        CliOptionName.Store,
        CliOptionName.Root,
        CliOptionName.Workspace,
        CliOptionName.Task,
        CliOptionName.Artifact,
        CliOptionName.ArtifactDigest,
        CliOptionName.ActorId,
      ]),
    );
    return {
      command: CliCommand.HookBind,
      outputFormat,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      workspaceRoot: requireValue(collected, CliOptionName.Root),
      workspaceId: requireValue(collected, CliOptionName.Workspace),
      taskId: requireValue(collected, CliOptionName.Task),
      artifactId: requireValue(collected, CliOptionName.Artifact),
      artifactDigest: requireValue(collected, CliOptionName.ArtifactDigest),
      actorId: collected.values.get(CliOptionName.ActorId) ?? DEFAULT_CLI_ACTOR_ID,
    };
  }
  if (isExactCommand(collected.positionals, ["hook", "config"])) {
    validateAllowedOptions(collected, new Set([CliOptionName.Executor]));
    return {
      command: CliCommand.HookConfig,
      outputFormat: CliOutputFormat.Human,
      executor: parseHookExecutor(requireValue(collected, CliOptionName.Executor)),
    };
  }
  if (isExactCommand(collected.positionals, ["hook", "probe"])) {
    validateAllowedOptions(
      collected,
      new Set([CliOptionName.Json, CliOptionName.Executor, CliOptionName.Executable]),
    );
    return {
      command: CliCommand.HookProbe,
      outputFormat,
      executor: parseHookExecutor(requireValue(collected, CliOptionName.Executor)),
      executable: parseProbeExecutable(collected.values.get(CliOptionName.Executable) ?? "codex"),
    };
  }
  if (isExactCommand(collected.positionals, ["hook", "handle"])) {
    validateAllowedOptions(collected, new Set([CliOptionName.Store, CliOptionName.Executor]));
    return {
      command: CliCommand.HookHandle,
      outputFormat: CliOutputFormat.Human,
      ...(storeRoot === undefined ? {} : { storeRoot }),
      executor: parseHookExecutor(requireValue(collected, CliOptionName.Executor)),
    };
  }
  throw new HarnessError(HarnessErrorCode.InvalidInput, "Unsupported CLI command.", {
    command: collected.positionals.join(" "),
  });
}
