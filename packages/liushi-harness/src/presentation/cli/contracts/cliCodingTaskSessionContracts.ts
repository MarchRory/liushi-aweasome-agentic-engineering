import type { CliVerificationMode } from "../enums/index.js";
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

/** 完成外部 Agent CodingTask Session 的 Delivery。 */
export interface CodingTaskSessionCompleteCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.CodingTaskSessionComplete;
  /** 完整 Delivery Completion JSON 文件。 */
  readonly filePath: string;
  /** CLI 声明的 Workspace 绑定。 */
  readonly workspaceId: string;
  /** CLI 声明的 Session 绑定。 */
  readonly sessionId: string;
  /** CLI 声明的 Repository 绑定。 */
  readonly repositoryId: string;
  /** CLI 声明的 Repository 绝对根目录。 */
  readonly repositoryRoot: string;
  /** CLI 声明的调用 Actor。 */
  readonly actorId: string;
  /** 本次 Completion 使用的 Verification 模式。 */
  readonly verificationMode: CliVerificationMode;
}

/** 评估 CodingTask Session Closeout Recovery 的 CLI 命令。 */
export interface CodingTaskSessionCloseoutRecoveryAssessCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.CodingTaskSessionCloseoutRecoveryAssess;
  /** 操作员声明的 CLI 工作区绑定。 */
  readonly workspaceId: string;
  /** 外部 CodingTask Session 标识。 */
  readonly sessionId: string;
  /** 操作员声明的 CLI Repository 绑定。 */
  readonly repositoryId: string;
  /** 操作员声明的 CLI Repository 绝对根目录。 */
  readonly repositoryRoot: string;
}

/** 执行 CodingTask Session Closeout Recovery 的 CLI 命令。 */
export interface CodingTaskSessionCloseoutRecoverCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.CodingTaskSessionCloseoutRecover;
  /** Human Recovery Command Envelope JSON 文件。 */
  readonly filePath: string;
  /** 操作员声明的 CLI 工作区绑定。 */
  readonly workspaceId: string;
  /** 外部 CodingTask Session 标识。 */
  readonly sessionId: string;
  /** 操作员声明的 CLI Repository 绑定。 */
  readonly repositoryId: string;
  /** 操作员声明的 CLI Repository 绝对根目录。 */
  readonly repositoryRoot: string;
  /** 发起 Recovery 的 Human 标识。 */
  readonly actorId: string;
}

/** 读取 CodingTask Session Effective Closeout 的 CLI 命令。 */
export interface CodingTaskSessionEffectiveCloseoutCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.CodingTaskSessionEffectiveCloseout;
  /** Harness 工作区标识。 */
  readonly workspaceId: string;
  /** 外部 CodingTask Session 标识。 */
  readonly sessionId: string;
}
