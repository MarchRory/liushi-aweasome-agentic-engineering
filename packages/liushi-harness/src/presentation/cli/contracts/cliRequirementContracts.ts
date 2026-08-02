import type { BaseCliCommand, CliCommand } from "./cliCommandContracts.js";

/** Requirement Analyze 命令。 */
export interface RequirementAnalyzeCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.RequirementAnalyze;
  /** 当前分析所属 Workspace。 */
  readonly workspaceId: string;
  /** 当前分析绑定的 Repository。 */
  readonly repositoryId: string;
  /** Agent 只读访问的 Repository 绝对根目录。 */
  readonly repositoryRoot: string;
  /** PRD 文本文件的绝对路径。 */
  readonly prdFilePath: string;
  /** 实际运行的 Codex 可执行文件或命令名。 */
  readonly executable: string;
  /** 顶层 Requirement 分析使用的显式模型。 */
  readonly model: string;
}

/** Requirement Human Review 确认命令。 */
export interface RequirementConfirmCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.RequirementConfirm;
  /** Requirement 所属 Workspace。 */
  readonly workspaceId: string;
  /** 已存在的目标 Task。 */
  readonly taskId: string;
  /** Requirement 绑定的单一 Repository。 */
  readonly repositoryId: string;
  /** Human 已编辑的 Requirement Analysis JSON 文件。 */
  readonly filePath: string;
  /** 执行语义确认的 Human Actor ID。 */
  readonly actorId: string;
}
