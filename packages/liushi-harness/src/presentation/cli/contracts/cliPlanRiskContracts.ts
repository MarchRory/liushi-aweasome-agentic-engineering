import type { BaseCliCommand, CliCommand } from "./cliCommandContracts.js";

/** PlanRisk Analyze 命令。 */
export interface PlanRiskAnalyzeCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.PlanRiskAnalyze;
  /** 当前分析所属 Workspace。 */
  readonly workspaceId: string;
  /** 已完成 Requirement G1 的 Task。 */
  readonly taskId: string;
  /** 当前分析绑定的单一 Repository。 */
  readonly repositoryId: string;
  /** Agent 只读访问的 Repository 绝对根目录。 */
  readonly repositoryRoot: string;
  /** 实际运行的 Codex 可执行文件或命令名。 */
  readonly executable: string;
  /** 顶层 Planning 分析使用的显式模型。 */
  readonly model: string;
}

/** PlanRisk Human Review 确认命令。 */
export interface PlanRiskConfirmCliCommand extends BaseCliCommand {
  /** 规范命令标识。 */
  readonly command: CliCommand.PlanRiskConfirm;
  /** Planning Review 所属 Workspace。 */
  readonly workspaceId: string;
  /** Planning Review 所属 Task。 */
  readonly taskId: string;
  /** Planning Review 绑定的单一 Repository。 */
  readonly repositoryId: string;
  /** Human 已编辑的 PlanRisk Analysis JSON 文件。 */
  readonly filePath: string;
  /** 执行语义确认的 Human Actor ID。 */
  readonly actorId: string;
}
