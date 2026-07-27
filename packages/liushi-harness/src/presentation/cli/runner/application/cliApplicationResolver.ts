import {
  CliCommand,
  type CliApplication,
  type ParsedCliCommand,
  type RunCliDependencies,
} from "../../contracts/index.js";
import { CliApplicationBindingScope } from "../../enums/index.js";

/** 按命令作用域创建无全局可变状态的 CLI Application。 */
export function resolveCliApplication(
  command: ParsedCliCommand,
  dependencies: RunCliDependencies,
): CliApplication {
  const storeRoot = command.storeRoot ?? dependencies.defaultStoreRoot;
  switch (command.command) {
    case CliCommand.CellRun:
      return dependencies.applicationFactory.create(storeRoot, {
        scope: CliApplicationBindingScope.CodingTaskCell,
        repositoryBinding: {
          workspaceId: command.workspaceId,
          repositoryId: command.repositoryId,
          repositoryRoot: command.repositoryRoot,
        },
        verificationMode: command.verificationMode,
      });
    case CliCommand.CodingTaskSessionActivate:
    case CliCommand.CodingTaskSessionCloseout:
      return dependencies.applicationFactory.create(storeRoot, {
        scope: CliApplicationBindingScope.CodingTaskSession,
        repositoryBinding: {
          workspaceId: command.workspaceId,
          repositoryId: command.repositoryId,
          repositoryRoot: command.repositoryRoot,
        },
        sessionActorId: command.actorId,
      });
    case CliCommand.CodingTaskSessionCloseoutRecoveryAssess:
    case CliCommand.CodingTaskSessionCloseoutRecover:
      return dependencies.applicationFactory.create(storeRoot, {
        scope: CliApplicationBindingScope.Repository,
        repositoryBinding: {
          workspaceId: command.workspaceId,
          repositoryId: command.repositoryId,
          repositoryRoot: command.repositoryRoot,
        },
      });
    case CliCommand.CodingTaskSessionEffectiveCloseout:
      return dependencies.applicationFactory.create(storeRoot);
    case CliCommand.Help:
    case CliCommand.Doctor:
    case CliCommand.TaskCreate:
    case CliCommand.TaskStatus:
    case CliCommand.ArtifactPropose:
    case CliCommand.ApprovalDecide:
    case CliCommand.RulesResolve:
    case CliCommand.ProjectScan:
    case CliCommand.ProfileCompile:
    case CliCommand.HookBind:
    case CliCommand.HookHandle:
    case CliCommand.HookConfig:
    case CliCommand.HookProbe:
    case CliCommand.InitDryRun:
    case CliCommand.InitApply:
    case CliCommand.ExecutorCompatibilityCompile:
    case CliCommand.ExecutorCompatibilityQuery:
    case CliCommand.ExecutorCompatibilityBundleCreate:
      return dependencies.applicationFactory.create(storeRoot);
  }
}
