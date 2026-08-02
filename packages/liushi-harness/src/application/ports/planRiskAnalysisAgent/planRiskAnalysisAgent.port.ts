import type { HarnessError, Result } from "#common/index.js";
import type {
  BusinessLogicChangeContractPayload,
  RequirementContractPayload,
} from "#domain/artifact/index.js";

/** PlanRisk 分析 Agent 接收的只读上下文。 */
export interface PlanRiskAnalysisAgentInput {
  /** 当前规划绑定的单一 Repository。 */
  readonly repositoryId: string;
  /** Agent 只读访问的 Repository 绝对根目录。 */
  readonly repositoryRoot: string;
  /** 已通过 G1 的 Requirement Contract。 */
  readonly requirement: RequirementContractPayload;
  /** 已通过 G2 的历史业务逻辑契约；未涉及历史逻辑时不存在。 */
  readonly approvedBusinessLogic?: BusinessLogicChangeContractPayload;
}

/** 只读 PlanRisk 分析执行器边界。 */
export interface PlanRiskAnalysisAgent {
  /** 分析已批准需求与代码仓库，返回待 Application 校验的结构化 Review 候选。 */
  analyze(input: PlanRiskAnalysisAgentInput): Promise<Result<unknown, HarnessError>>;
}
