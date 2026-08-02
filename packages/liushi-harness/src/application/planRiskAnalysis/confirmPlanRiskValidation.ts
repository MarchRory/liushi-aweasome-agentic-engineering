import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ArtifactType,
  MAX_ARTIFACT_TEXT_LENGTH,
  parseArtifactProposal,
  type BusinessLogicChangeContractProposal,
} from "#domain/artifact/index.js";
import { RiskLevel } from "#domain/policy/index.js";
import { z } from "zod";

import { MAX_BUSINESS_LOGIC_HUMAN_QUESTIONS } from "./planRiskAnalysis.constants.js";
import type { ConfirmPlanRiskInput, PlanRiskProposalDraft } from "./planRiskAnalysis.contracts.js";
import { PlanRiskAnalysisStatus, PlanRiskReviewKind } from "./planRiskAnalysis.enums.js";
import { parsePlanRiskProposalDraft } from "./planRiskAnalysisValidation.js";

const analysisDocumentSchema = z
  .object({
    workspaceId: z.string(),
    taskId: z.string(),
    repositoryId: z.string(),
    analysisStatus: z.enum(PlanRiskAnalysisStatus),
    proposal: z.unknown(),
    humanQuestions: z.array(z.string()),
    reviewDraft: z.unknown(),
  })
  .strict();

const businessLogicReviewSchema = z
  .object({
    kind: z.literal(PlanRiskReviewKind.BusinessLogic),
    proposal: z.unknown(),
    answers: z
      .array(
        z
          .object({
            question: z.string().trim().min(1).max(MAX_ARTIFACT_TEXT_LENGTH),
            answer: z.string().trim().min(1).max(MAX_ARTIFACT_TEXT_LENGTH),
          })
          .strict(),
      )
      .max(MAX_BUSINESS_LOGIC_HUMAN_QUESTIONS),
  })
  .strict();

const planRiskReviewSchema = z
  .object({
    kind: z.literal(PlanRiskReviewKind.PlanRisk),
    proposal: z.unknown(),
  })
  .strict();

/** 校验 Analysis 文档作用域与 Human Review，返回可持久化的语义 Proposal。 */
export function parseConfirmedPlanningReview(input: ConfirmPlanRiskInput): Result<
  | {
      readonly kind: PlanRiskReviewKind.BusinessLogic;
      readonly proposal: BusinessLogicChangeContractProposal;
    }
  | { readonly kind: PlanRiskReviewKind.PlanRisk; readonly proposal: PlanRiskProposalDraft },
  HarnessError
> {
  const document = parseAnalysisDocument(input);
  if (document.status === ResultStatus.Failure) return document;
  if (document.value.analysisStatus === PlanRiskAnalysisStatus.BusinessLogicReviewRequired) {
    const proposal = parseConfirmedBusinessLogic(
      document.value.proposal,
      document.value.reviewDraft,
    );
    return proposal.status === ResultStatus.Failure
      ? proposal
      : success({ kind: PlanRiskReviewKind.BusinessLogic, proposal: proposal.value });
  }
  const proposal = parseConfirmedPlanRisk(document.value.proposal, document.value.reviewDraft);
  return proposal.status === ResultStatus.Failure
    ? proposal
    : success({ kind: PlanRiskReviewKind.PlanRisk, proposal: proposal.value });
}

function parseAnalysisDocument(input: ConfirmPlanRiskInput) {
  const parsed = analysisDocumentSchema.safeParse(input.analysisDocument);
  if (!parsed.success) return failure(invalidReview("PlanRisk Analysis 文件格式无效。"));
  if (
    parsed.data.workspaceId !== input.workspaceId ||
    parsed.data.taskId !== input.taskId ||
    parsed.data.repositoryId !== input.repositoryId
  ) {
    return failure(invalidReview("PlanRisk Analysis 文件与命令作用域不一致。"));
  }
  return success(parsed.data);
}

function parseConfirmedBusinessLogic(
  analysisProposal: unknown,
  reviewDraft: unknown,
): Result<BusinessLogicChangeContractProposal, HarnessError> {
  const original = parseBusinessLogicProposal(analysisProposal);
  if (original.status === ResultStatus.Failure) return original;
  const review = businessLogicReviewSchema.safeParse(reviewDraft);
  if (!review.success) return failure(invalidReview("Business Logic Review 格式无效。"));
  const reviewed = parseBusinessLogicProposal(review.data.proposal);
  if (reviewed.status === ResultStatus.Failure) return reviewed;
  const coverage = validateBusinessLogicCoverage(
    original.value,
    reviewed.value,
    review.data.answers,
  );
  if (coverage !== undefined) return failure(coverage);
  return success({
    ...reviewed.value,
    payload: {
      ...reviewed.value.payload,
      unknowns: [],
    },
  });
}

function parseBusinessLogicProposal(
  input: unknown,
): Result<BusinessLogicChangeContractProposal, HarnessError> {
  const parsed = parseArtifactProposal(input);
  if (
    parsed.status === ResultStatus.Failure ||
    parsed.value.artifactType !== ArtifactType.BusinessLogicChangeContract
  ) {
    return failure(invalidReview("Business Logic Proposal 不符合 Artifact 契约。"));
  }
  return success(parsed.value);
}

function validateBusinessLogicCoverage(
  original: BusinessLogicChangeContractProposal,
  reviewed: BusinessLogicChangeContractProposal,
  answers: readonly { readonly question: string; readonly answer: string }[],
): HarnessError | undefined {
  const questions = original.payload.unknowns;
  if (!sameStrings(reviewed.payload.unknowns, questions)) {
    return invalidReview("Review Proposal 必须保留原始 Business Logic 问题。", "unknowns");
  }
  if (
    answers.length !== questions.length ||
    answers.some((answer, index) => answer.question !== questions[index])
  ) {
    return invalidReview("Human Answers 必须按原始顺序完整覆盖全部问题。", "answers");
  }
  return undefined;
}

function parseConfirmedPlanRisk(
  analysisProposal: unknown,
  reviewDraft: unknown,
): Result<PlanRiskProposalDraft, HarnessError> {
  const original = parsePlanRiskProposalDraft(analysisProposal);
  if (original.status === ResultStatus.Failure) return original;
  const review = planRiskReviewSchema.safeParse(reviewDraft);
  if (!review.success) return failure(invalidReview("PlanRisk Review 格式无效。"));
  const reviewed = parsePlanRiskProposalDraft(review.data.proposal);
  if (reviewed.status === ResultStatus.Failure) return reviewed;
  if (
    reviewed.value.payload.historicalLogicChange !== original.value.payload.historicalLogicChange
  ) {
    return failure(invalidReview("Human Review 不能改变历史业务逻辑分类。"));
  }
  if (riskRank(reviewed.value.payload.riskLevel) < riskRank(original.value.payload.riskLevel)) {
    return failure(invalidReview("Human Review 不能降低 Agent 已识别的风险等级。"));
  }
  return reviewed;
}

function riskRank(riskLevel: RiskLevel): number {
  return [RiskLevel.R0, RiskLevel.R1, RiskLevel.R2, RiskLevel.R3, RiskLevel.R4].indexOf(riskLevel);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidReview(message: string, field = "analysisDocument"): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, message, { field });
}
