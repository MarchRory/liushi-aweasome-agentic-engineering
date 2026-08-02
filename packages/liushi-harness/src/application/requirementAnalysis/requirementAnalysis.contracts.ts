import type { ActorRef } from "#common/index.js";
import type { ApprovalRecord } from "#domain/approval/index.js";
import type {
  RequirementContractArtifact,
  RequirementContractProposal,
} from "#domain/artifact/index.js";
import type { GateEvaluation } from "#domain/gate/index.js";
import type { TaskState } from "#domain/task/index.js";

import type {
  RequirementAnalysisStatus,
  RequirementConfirmationStatus,
  RequirementNextStep,
} from "./requirementAnalysis.enums.js";

/** Human 在确认前填写的单个问题草稿。 */
export interface RequirementHumanAnswerDraft {
  /** Agent 提出的原始业务问题。 */
  readonly question: string;
  /** Human 填写的答案；分析输出时为空。 */
  readonly answer: string;
}

/** `requirement analyze --json` 输出的可编辑 Human Review 草稿。 */
export interface RequirementReviewDraft {
  /** Human 可以修订的完整 Requirement Proposal。 */
  readonly proposal: RequirementContractProposal;
  /** 与 Proposal unknowns 顺序一致的问答。 */
  readonly answers: readonly RequirementHumanAnswerDraft[];
}

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
  /** 可直接保存、编辑并提交给 `requirement confirm` 的草稿。 */
  readonly reviewDraft: RequirementReviewDraft;
}

/** Human 确认 Requirement 的 Application 输入。 */
export interface ConfirmRequirementInput {
  /** Requirement 所属 Workspace。 */
  readonly workspaceId: string;
  /** 已存在且尚未提交 Requirement Artifact 的 Task。 */
  readonly taskId: string;
  /** Requirement 绑定的单一 Repository。 */
  readonly repositoryId: string;
  /** `requirement analyze` 生成的原始 Proposal。 */
  readonly analysisProposal: unknown;
  /** Human 已填写并修订的 Review Draft。 */
  readonly review: unknown;
  /** 执行语义确认的 Human Actor。 */
  readonly actor: ActorRef;
}

/** Human 确认并持久化 Requirement 后的结果。 */
export interface ConfirmRequirementOutput {
  /** Requirement 已确认。 */
  readonly confirmationStatus: RequirementConfirmationStatus;
  /** 主线的下一业务步骤。 */
  readonly nextStep: RequirementNextStep;
  /** 最终写入结构化 Human Answer 的 Proposal。 */
  readonly proposal: RequirementContractProposal;
  /** 已持久化的 Requirement Artifact。 */
  readonly artifact: RequirementContractArtifact;
  /** 首次确认时记录的 G1 Approval；幂等重放时可以省略。 */
  readonly approval?: ApprovalRecord;
  /** G1 Approval 后由 Core 重算的 Gate。 */
  readonly gateEvaluation: GateEvaluation;
  /** Event Replay 后的权威 Task 状态。 */
  readonly task: TaskState;
}
