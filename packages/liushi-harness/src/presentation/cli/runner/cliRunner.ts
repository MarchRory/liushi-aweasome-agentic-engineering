import { isRuleResolutionBlocked } from "#application/index.js";
import { ActorKind, HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";
import { parseCliArguments, requestsJsonOutput } from "../parser/index.js";
import {
  CliCommand,
  CliOutputFormat,
  type ApprovalDecideCliCommand,
  type ArtifactProposeCliCommand,
  type CliApplication,
  type ParsedCliCommand,
  type ProfileCompileCliCommand,
  type RunCliDependencies,
  type RulesResolveCliCommand,
  type TaskCreateCliCommand,
  type TaskStatusCliCommand,
} from "../contracts/index.js";
import {
  executeCellRun,
  executeCodingTaskSessionActivate,
  executeDoctor,
  executeExecutorCompatibilityCommand,
  executeHookBind,
  executeHookConfig,
  executeHookHandle,
  executeHookProbe,
  executeProjectScan,
  executeInitApply,
  executeInitDryRun,
} from "./commands/index.js";
import {
  CLI_EXIT_CODE_SUCCESS,
  mapErrorExitCode,
  writeBlocked,
  writeFailure,
  writeSuccess,
} from "../output/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_INVALID_INPUT,
  CLI_USAGE_LINES,
} from "../constants/index.js";
import { resolveCliApplication } from "./application/index.js";

/** 解析并执行一次 CLI 调用，返回稳定退出码。 */
export async function runCli(
  args: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const parsed = parseCliArguments(args);
  if (parsed.status === ResultStatus.Failure) {
    writeFailure(
      dependencies,
      requestsJsonOutput(args) ? CliOutputFormat.Json : CliOutputFormat.Human,
      CliCommand.Unknown,
      parsed.error,
    );
    return mapErrorExitCode(parsed.error.code);
  }

  try {
    return await executeCommand(parsed.value, dependencies);
  } catch (error) {
    const harnessError =
      error instanceof HarnessError
        ? error
        : new HarnessError(HarnessErrorCode.IoFailure, "CLI execution failed.", {}, error);
    if (
      parsed.value.command === CliCommand.HookHandle ||
      parsed.value.command === CliCommand.HookConfig
    ) {
      dependencies.writer.stderr(`${harnessError.message}\n`);
      return CLI_EXIT_CODE_INVALID_INPUT;
    }
    writeFailure(dependencies, parsed.value.outputFormat, parsed.value.command, harnessError);
    return mapErrorExitCode(harnessError.code);
  }
}

async function executeCommand(
  command: ParsedCliCommand,
  dependencies: RunCliDependencies,
): Promise<number> {
  if (command.command === CliCommand.InitDryRun) {
    return executeInitDryRun(command, resolveCliApplication(command, dependencies), dependencies);
  }
  if (command.command === CliCommand.InitApply) {
    return executeInitApply(command, resolveCliApplication(command, dependencies), dependencies);
  }
  switch (command.command) {
    case CliCommand.Help:
      writeSuccess(dependencies, command.outputFormat, command.command, {
        usage: CLI_USAGE_LINES,
      });
      return CLI_EXIT_CODE_SUCCESS;
    case CliCommand.Doctor:
      return executeDoctor(command, resolveCliApplication(command, dependencies), dependencies);
    case CliCommand.TaskCreate:
      return executeTaskCreate(command, resolveCliApplication(command, dependencies), dependencies);
    case CliCommand.TaskStatus:
      return executeTaskStatus(command, resolveCliApplication(command, dependencies), dependencies);
    case CliCommand.ArtifactPropose:
      return executeArtifactPropose(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.ApprovalDecide:
      return executeApprovalDecide(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.RulesResolve:
      return executeRulesResolve(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.ProjectScan:
      return executeProjectScan(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.ProfileCompile:
      return executeProfileCompile(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.CellRun:
      return executeCellRun(command, resolveCliApplication(command, dependencies), dependencies);
    case CliCommand.CodingTaskSessionActivate:
      return executeCodingTaskSessionActivate(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.HookBind:
      return executeHookBind(command, resolveCliApplication(command, dependencies), dependencies);
    case CliCommand.HookConfig:
      return executeHookConfig(command, dependencies);
    case CliCommand.HookProbe:
      return executeHookProbe(command, resolveCliApplication(command, dependencies), dependencies);
    case CliCommand.HookHandle:
      return executeHookHandle(command, resolveCliApplication(command, dependencies), dependencies);
    case CliCommand.ExecutorCompatibilityCompile:
    case CliCommand.ExecutorCompatibilityQuery:
    case CliCommand.ExecutorCompatibilityBundleCreate:
      return executeExecutorCompatibilityCommand(command, dependencies);
  }
}

async function executeTaskCreate(
  command: TaskCreateCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.createTask.execute({
    workspaceId: command.workspaceId,
    ...(command.source === undefined ? {} : { source: command.source }),
    actor: { kind: ActorKind.Human, actorId: command.actorId },
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, {
    ...result.value.task,
    persistence: result.value.persistence,
  });
  return CLI_EXIT_CODE_SUCCESS;
}

async function executeTaskStatus(
  command: TaskStatusCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.getTaskStatus.execute({
    workspaceId: command.workspaceId,
    taskId: command.taskId,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

async function executeArtifactPropose(
  command: ArtifactProposeCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const document = await dependencies.jsonDocumentReader.read(command.filePath);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const result = await application.proposeArtifact.execute({
    workspaceId: command.workspaceId,
    taskId: command.taskId,
    proposal: document.value,
    actor: { kind: ActorKind.Human, actorId: command.actorId },
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

async function executeApprovalDecide(
  command: ApprovalDecideCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.recordApproval.execute({
    workspaceId: command.workspaceId,
    taskId: command.taskId,
    decisionRequestId: command.decisionRequestId,
    decisionRequestDigest: command.decisionRequestDigest,
    idempotencyKey: command.idempotencyKey,
    actor: { kind: ActorKind.Human, actorId: command.actorId },
    decision: command.decision,
    ...(command.reason === undefined ? {} : { reason: command.reason }),
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

async function executeRulesResolve(
  command: RulesResolveCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const catalog = await dependencies.jsonDocumentReader.read(command.catalogFilePath);
  if (catalog.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, catalog.error);
    return mapErrorExitCode(catalog.error.code);
  }
  const context = await dependencies.jsonDocumentReader.read(command.contextFilePath);
  if (context.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, context.error);
    return mapErrorExitCode(context.error.code);
  }
  const result = application.resolveRules.execute({
    catalog: catalog.value,
    context: context.value,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (isRuleResolutionBlocked(result.value)) {
    writeBlocked(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_CONFLICT;
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

async function executeProfileCompile(
  command: ProfileCompileCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const document = await dependencies.jsonDocumentReader.read(command.reportFilePath);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const result = await application.compileProjectProfile.execute({
    workspaceId: command.workspaceId,
    taskId: command.taskId,
    artifactId: command.artifactId,
    report: document.value,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}
