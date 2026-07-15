import { ResultStatus } from "#common/index.js";
import type {
  CliApplication,
  InitApplyCliCommand,
  InitDryRunCliCommand,
  RunCliDependencies,
} from "../../contracts/index.js";
import { mapErrorExitCode, writeFailure, writeSuccess } from "../../output/index.js";

/** 执行仅写 Runtime Store 的 Managed File InstallPlan dry-run。 */
export async function executeInitDryRun(
  command: InitDryRunCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.createInstallPlan.execute({
    target: command.target,
    root: command.root,
    workspaceId: command.workspaceId,
    repositoryId: command.repositoryId,
    actorId: command.actorId,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return 0;
}

/** 执行 Human 显式批准并闭合受管文件 Apply。 */
export async function executeInitApply(
  command: InitApplyCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.applyInstallPlan.execute({
    workspaceId: command.workspaceId,
    repositoryId: command.repositoryId,
    planId: command.planId,
    planDigest: command.planDigest,
    actorId: command.actorId,
    idempotencyKey: command.idempotencyKey,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return 0;
}
