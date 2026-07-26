import type { BaseCliCommand, CliCommand } from "./cliCommandContracts.js";

/** 激活外部 Agent CodingTask Session 的 CLI 命令。 */
export interface CodingTaskSessionActivateCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.CodingTaskSessionActivate;
  /** Session Activation Manifest JSON 文件。 */
  readonly filePath: string;
  /** 操作员声明的 CLI 工作区绑定。 */
  readonly workspaceId: string;
  /** 操作员声明的 CLI Repository 绑定。 */
  readonly repositoryId: string;
  /** 操作员声明的 CLI Repository 绝对根目录。 */
  readonly repositoryRoot: string;
  /** 操作员声明并与三个 Command Actor 精确复验的审计身份。 */
  readonly actorId: string;
}

/** 关闭外部 Agent CodingTask Session 的 CLI 命令。 */
export interface CodingTaskSessionCloseoutCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.CodingTaskSessionCloseout;
  /** 严格 Closeout Command Envelope JSON 文件。 */
  readonly filePath: string;
  /** 操作员声明的 CLI 工作区绑定。 */
  readonly workspaceId: string;
  /** 操作员声明的 CLI Repository 绑定。 */
  readonly repositoryId: string;
  /** 操作员声明的 CLI Repository 绝对根目录。 */
  readonly repositoryRoot: string;
  /** 操作员声明并与 Command Actor 精确复验的审计身份。 */
  readonly actorId: string;
}
