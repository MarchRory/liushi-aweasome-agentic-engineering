import {
  CliCommand,
  type CliApplication,
  type ParsedCliCommand,
  type RunCliDependencies,
} from "../../contracts/index.js";

/** 按命令作用域创建无全局可变状态的 CLI Application。 */
export function resolveCliApplication(
  command: ParsedCliCommand,
  dependencies: RunCliDependencies,
): CliApplication {
  const storeRoot = command.storeRoot ?? dependencies.defaultStoreRoot;
  if (
    command.command !== CliCommand.CellRun &&
    command.command !== CliCommand.CodingTaskSessionActivate
  ) {
    return dependencies.applicationFactory.create(storeRoot);
  }
  const repositoryBinding = {
    workspaceId: command.workspaceId,
    repositoryId: command.repositoryId,
    repositoryRoot: command.repositoryRoot,
  };
  return dependencies.applicationFactory.create(storeRoot, {
    repositoryBinding,
    ...(command.command === CliCommand.CellRun
      ? { verificationMode: command.verificationMode }
      : { sessionActorId: command.actorId }),
  });
}
