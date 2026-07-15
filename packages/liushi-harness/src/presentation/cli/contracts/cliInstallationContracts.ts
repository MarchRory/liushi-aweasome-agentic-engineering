import type { CreateInstallPlanInput } from "#application/index.js";
import type { BaseCliCommand, CliCommand } from "./cliCommandContracts.js";

/** Managed File InstallPlan dry-run 命令。 */
export interface InitDryRunCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  command: CliCommand.InitDryRun;
  /** 执行器安装目标。 */
  target: CreateInstallPlanInput["target"];
  /** Repository 绝对根目录。 */
  root: string;
  /** Workspace 标识。 */
  workspaceId: string;
  /** Repository 标识。 */
  repositoryId: string;
  /** 显式 dry-run 开关。 */
  dryRun: true;
  /** 计划创建 actor。 */
  actorId: string;
}
