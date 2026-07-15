import type { ApplyInstallPlanInput, CreateInstallPlanInput } from "#application/index.js";
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

/** Human 显式批准精确 InstallPlan 的 Apply 命令。 */
export interface InitApplyCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.InitApply;
  /** 计划所属 Workspace。 */
  readonly workspaceId: ApplyInstallPlanInput["workspaceId"];
  /** 计划唯一写入的 Repository。 */
  readonly repositoryId: ApplyInstallPlanInput["repositoryId"];
  /** 被批准的 InstallPlan ID。 */
  readonly planId: ApplyInstallPlanInput["planId"];
  /** 被批准的精确计划摘要。 */
  readonly planDigest: ApplyInstallPlanInput["planDigest"];
  /** Human 审计身份。 */
  readonly actorId: ApplyInstallPlanInput["actorId"];
  /** 批准重试使用的稳定幂等键。 */
  readonly idempotencyKey: ApplyInstallPlanInput["idempotencyKey"];
}
