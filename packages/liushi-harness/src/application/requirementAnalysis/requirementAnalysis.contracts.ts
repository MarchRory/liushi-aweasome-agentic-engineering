import type { RequirementContractProposal } from "#domain/artifact/index.js";

import type { RequirementAnalysisStatus } from "./requirementAnalysis.enums.js";

/** 只读 Requirement 分析 Use Case 输入。 */
export interface AnalyzeRequirementInput {
  /** 当前分析所属 Workspace。 */
  readonly workspaceId: string;
  /** 当前分析绑定的单一 Repository。 */
  readonly repositoryId: string;
  /** Agent 只读访问的 Repository 绝对根目录。 */
  readonly repositoryRoot: string;
  /** 不包含本机绝对路径的 PRD 来源名称。 */
  readonly prdSource: string;
  /** 作为不受信任业务输入处理的 PRD 正文。 */
  readonly prdContent: string;
}

/** 只读 Requirement 分析 Use Case 输出。 */
export interface AnalyzeRequirementOutput {
  /** 当前分析所属 Workspace。 */
  readonly workspaceId: string;
  /** 当前分析绑定的 Repository。 */
  readonly repositoryId: string;
  /** 已通过现有 Artifact Schema 和分析边界校验的 Proposal。 */
  readonly proposal: RequirementContractProposal;
  /** Human 下一步应执行的语义处理状态。 */
  readonly analysisStatus: RequirementAnalysisStatus;
  /** 需要 Human 回答的业务问题；直接来源于 Proposal unknowns。 */
  readonly humanQuestions: readonly string[];
}
