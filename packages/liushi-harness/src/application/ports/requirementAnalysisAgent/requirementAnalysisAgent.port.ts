import type { HarnessError, Result } from "#common/index.js";

/** Requirement 分析执行器接收的只读输入。 */
export interface RequirementAnalysisAgentInput {
  /** 当前分析绑定的 Repository 标识。 */
  readonly repositoryId: string;
  /** Agent 只读访问的 Repository 绝对根目录。 */
  readonly repositoryRoot: string;
  /** 不包含本机绝对路径的 PRD 来源名称。 */
  readonly prdSource: string;
  /** 作为不受信任业务输入处理的 PRD 正文。 */
  readonly prdContent: string;
}

/** 只读 Requirement 分析执行器边界。 */
export interface RequirementAnalysisAgent {
  /** 分析 PRD 与 Repository，并返回待 Application 校验的结构化 Proposal。 */
  analyze(input: RequirementAnalysisAgentInput): Promise<Result<unknown, HarnessError>>;
}
