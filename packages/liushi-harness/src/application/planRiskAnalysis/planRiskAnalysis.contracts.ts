import type { ActorRef } from "#common/index.js";
import type { ApprovalRecord } from "#domain/approval/index.js";
import type {
  ArtifactStatus,
  ArtifactType,
  BusinessLogicChangeContractArtifact,
  BusinessLogicChangeContractProposal,
  PlanRiskArtifact,
  PlanRiskPayload,
  PlanRiskProposal,
} from "#domain/artifact/index.js";
import type { GateEvaluation } from "#domain/gate/index.js";
import type { TaskState } from "#domain/task/index.js";

import type {
  PlanRiskAnalysisStatus,
  PlanRiskConfirmationStatus,
  PlanRiskNextStep,
  PlanRiskReviewKind,
} from "./planRiskAnalysis.enums.js";

/** 尚未绑定内部 Business Logic Digest 的 PlanRisk Proposal。 */
export interface PlanRiskProposalDraft {
  /** Proposal 类型固定为 PlanRisk。 */
  readonly artifactType: ArtifactType.PlanRisk;
  /** Review 阶段只允许 Proposed。 */
  readonly status: ArtifactStatus.Proposed;
  /** Human 可编辑的语义方案，不暴露内部 Artifact Digest。 */
  readonly payload: Omit<PlanRiskPayload, "businessLogicArtifactDigest">;
}

/** Human 在 Business Logic 确认前填写的单个答案。 */
export interface BusinessLogicHumanAnswerDraft {
  /** Agent 提出的原始业务问题。 */
  readonly question: string;
  /** Human 填写的业务答案；分析输出时为空。 */
  readonly answer: string;
}

/** Business Logic Change Contract 的可编辑 Review。 */
export interface BusinessLogicReviewDraft {
  /** Review 类别。 */
  readonly kind: PlanRiskReviewKind.BusinessLogic;
  /** Human 可修订的完整业务逻辑 Proposal。 */
  readonly proposal: BusinessLogicChangeContractProposal;
  /** 与 Proposal unknowns 顺序一致的 Human Answers。 */
  readonly answers: readonly BusinessLogicHumanAnswerDraft[];
}

/** PlanRisk Contract 的可编辑 Review。 */
export interface PlanRiskReviewDraft {
  /** Review 类别。 */
  readonly kind: PlanRiskReviewKind.PlanRisk;
  /** Human 可修订的完整技术方案与风险。 */
  readonly proposal: PlanRiskProposalDraft;
}

/** PlanRisk 只读分析输入。 */
export interface AnalyzePlanRiskInput {
  /** 当前分析所属 Workspace。 */
  readonly workspaceId: string;
  /** 已完成 Requirement G1 的 Task。 */
  readonly taskId: string;
  /** 当前分析绑定的单一 Repository。 */
  readonly repositoryId: string;
}

/** PlanRisk 分析输出的稳定任务作用域。 */
interface AnalyzePlanRiskOutputBase {
  /** 当前分析所属 Workspace。 */
  readonly workspaceId: string;
  /** 当前分析所属 Task。 */
  readonly taskId: string;
  /** 当前分析绑定的单一 Repository。 */
  readonly repositoryId: string;
}

/** 历史业务逻辑需要先由 Human 确认时的输出。 */
export interface AnalyzeBusinessLogicOutput extends AnalyzePlanRiskOutputBase {
  /** 当前停在 Business Logic Review。 */
  readonly analysisStatus: PlanRiskAnalysisStatus.BusinessLogicReviewRequired;
  /** 已通过领域校验的原始 Proposal。 */
  readonly proposal: BusinessLogicChangeContractProposal;
  /** 需要 Human 回答的业务问题。 */
  readonly humanQuestions: readonly string[];
  /** 可直接编辑并提交给 confirm 的 Review Draft。 */
  readonly reviewDraft: BusinessLogicReviewDraft;
}

/** 技术方案和风险可由 Human 审阅时的输出。 */
export interface AnalyzePlanRiskReviewOutput extends AnalyzePlanRiskOutputBase {
  /** 当前停在 PlanRisk Review。 */
  readonly analysisStatus: PlanRiskAnalysisStatus.PlanRiskReviewRequired;
  /** 已通过应用层校验并规范化 Gate 的原始 Proposal。 */
  readonly proposal: PlanRiskProposalDraft;
  /** PlanRisk Review 不通过隐式问答补业务决定。 */
  readonly humanQuestions: readonly [];
  /** 可直接编辑并提交给 confirm 的 Review Draft。 */
  readonly reviewDraft: PlanRiskReviewDraft;
}

/** PlanRisk 只读分析的判别联合输出。 */
export type AnalyzePlanRiskOutput = AnalyzeBusinessLogicOutput | AnalyzePlanRiskReviewOutput;

/** Human 确认 Planning Review 的输入。 */
export interface ConfirmPlanRiskInput {
  /** Planning Review 所属 Workspace。 */
  readonly workspaceId: string;
  /** Planning Review 所属 Task。 */
  readonly taskId: string;
  /** Planning Review 绑定的单一 Repository。 */
  readonly repositoryId: string;
  /** `plan-risk analyze --json` 输出的 data 对象。 */
  readonly analysisDocument: unknown;
  /** 执行语义确认的 Human Actor。 */
  readonly actor: ActorRef;
}

/** Planning Review 确认结果的共享 Gate 与 Task 状态。 */
interface ConfirmPlanRiskOutputBase {
  /** Review 已由 Human 确认。 */
  readonly confirmationStatus: PlanRiskConfirmationStatus.Confirmed;
  /** 首次确认时记录的 Approval；幂等重放或 R1 时可省略。 */
  readonly approval?: ApprovalRecord;
  /** 对应 Artifact 在确认后的 Gate 结果。 */
  readonly gateEvaluation: GateEvaluation;
  /** Event Replay 后的权威 Task。 */
  readonly task: TaskState;
}

/** Business Logic/G2 确认结果。 */
export interface ConfirmBusinessLogicOutput extends ConfirmPlanRiskOutputBase {
  /** 已确认的 Artifact 类型。 */
  readonly artifactType: ArtifactType.BusinessLogicChangeContract;
  /** 主线下一步必须重新分析 PlanRisk。 */
  readonly nextStep: PlanRiskNextStep.ReanalyzePlanRisk;
  /** 已写入结构化 Human Answers 的最终 Proposal。 */
  readonly proposal: BusinessLogicChangeContractProposal;
  /** 已持久化的 Business Logic Artifact。 */
  readonly artifact: BusinessLogicChangeContractArtifact;
}

/** PlanRisk/G4 确认结果。 */
export interface ConfirmPlanRiskReviewOutput extends ConfirmPlanRiskOutputBase {
  /** 已确认的 Artifact 类型。 */
  readonly artifactType: ArtifactType.PlanRisk;
  /** 主线下一步进入 CodingTask。 */
  readonly nextStep: PlanRiskNextStep.CodingTask;
  /** 已绑定内部 Business Logic Digest 的最终 Proposal。 */
  readonly proposal: PlanRiskProposal;
  /** 已持久化的 PlanRisk Artifact。 */
  readonly artifact: PlanRiskArtifact;
}

/** Planning Review Human 确认的判别联合输出。 */
export type ConfirmPlanRiskOutput = ConfirmBusinessLogicOutput | ConfirmPlanRiskReviewOutput;
