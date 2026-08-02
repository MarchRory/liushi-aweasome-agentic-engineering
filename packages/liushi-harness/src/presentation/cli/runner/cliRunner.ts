import { HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";
import { parseCliArguments, requestsJsonOutput } from "../parser/index.js";
import {
  CliCommand,
  CliOutputFormat,
  type ParsedCliCommand,
  type RunCliDependencies,
} from "../contracts/index.js";
import {
  executeApprovalDecide,
  executeArtifactPropose,
  executeCellRun,
  executeCodingTaskSessionCloseoutRecoveryAssess,
  executeCodingTaskSessionCloseoutRecoveryRecover,
  executeCodingTaskSessionEffectiveCloseout,
  executeCodingTaskSessionActivate,
  executeCodingTaskSessionCloseout,
  executeCodingTaskSessionComplete,
  executeCodingTaskSessionMetricsEnroll,
  executeCodingTaskSessionMetricsReport,
  executeCodingTaskSessionMetricsSettle,
  executeDoctor,
  executeExecutorCompatibilityCommand,
  executeHookBind,
  executeHookConfig,
  executeHookHandle,
  executeHookProbe,
  executeProjectScan,
  executeProfileCompile,
  executeRulesResolve,
  executeTaskCreate,
  executeTaskStatus,
  executeInitApply,
  executeInitDryRun,
  executeRequirementAnalyze,
  executeRequirementConfirm,
} from "./commands/index.js";
import {
  CLI_EXIT_CODE_SUCCESS,
  mapErrorExitCode,
  writeFailure,
  writeSuccess,
} from "../output/index.js";
import { CLI_EXIT_CODE_INVALID_INPUT, CLI_USAGE_LINES } from "../constants/index.js";
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
    case CliCommand.RequirementAnalyze:
      return executeRequirementAnalyze(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.RequirementConfirm:
      return executeRequirementConfirm(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.CodingTaskSessionActivate:
      return executeCodingTaskSessionActivate(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.CodingTaskSessionCloseout:
      return executeCodingTaskSessionCloseout(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.CodingTaskSessionComplete:
      return executeCodingTaskSessionComplete(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.CodingTaskSessionMetricsEnroll:
      return executeCodingTaskSessionMetricsEnroll(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.CodingTaskSessionMetricsSettle:
      return executeCodingTaskSessionMetricsSettle(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.CodingTaskSessionMetricsReport:
      return executeCodingTaskSessionMetricsReport(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.CodingTaskSessionCloseoutRecoveryAssess:
      return executeCodingTaskSessionCloseoutRecoveryAssess(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.CodingTaskSessionCloseoutRecover:
      return executeCodingTaskSessionCloseoutRecoveryRecover(
        command,
        resolveCliApplication(command, dependencies),
        dependencies,
      );
    case CliCommand.CodingTaskSessionEffectiveCloseout:
      return executeCodingTaskSessionEffectiveCloseout(
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
