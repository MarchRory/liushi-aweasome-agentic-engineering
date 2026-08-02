import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ArtifactStatus,
  ArtifactType,
  parseArtifactProposal,
  planRiskPayloadObjectSchema,
  validateArtifactEvidence,
  type BusinessLogicChangeContractProposal,
} from "#domain/artifact/index.js";
import { GateId, RiskLevel } from "#domain/policy/index.js";
import { z } from "zod";

import { MAX_BUSINESS_LOGIC_HUMAN_QUESTIONS } from "./planRiskAnalysis.constants.js";
import type { PlanRiskProposalDraft } from "./planRiskAnalysis.contracts.js";
import { PlanRiskReviewKind } from "./planRiskAnalysis.enums.js";

const agentCandidateSchema = z
  .object({
    analysisKind: z.enum(PlanRiskReviewKind),
    businessLogicProposal: z.unknown().nullable(),
    planRiskProposal: z.unknown().nullable(),
  })
  .strict();

const planRiskProposalDraftSchema = z
  .object({
    artifactType: z.literal(ArtifactType.PlanRisk),
    status: z.literal(ArtifactStatus.Proposed),
    payload: planRiskPayloadObjectSchema.omit({ businessLogicArtifactDigest: true }),
  })
  .strict();

/** 已通过 Application 边界校验的 Agent 候选。 */
export type ParsedPlanRiskAgentCandidate =
  | {
      readonly kind: PlanRiskReviewKind.BusinessLogic;
      readonly proposal: BusinessLogicChangeContractProposal;
    }
  | { readonly kind: PlanRiskReviewKind.PlanRisk; readonly proposal: PlanRiskProposalDraft };

/** 校验 Agent 线格式、阶段与风险不变量。 */
export function parsePlanRiskAgentCandidate(
  input: unknown,
  hasApprovedBusinessLogic: boolean,
): Result<ParsedPlanRiskAgentCandidate, HarnessError> {
  const parsed = agentCandidateSchema.safeParse(input);
  if (!parsed.success) return failure(invalidAgentOutput("Agent 输出线格式无效。"));

  if (parsed.data.analysisKind === PlanRiskReviewKind.BusinessLogic) {
    if (hasApprovedBusinessLogic) {
      return failure(invalidAgentOutput("已有 G2 契约时不能再次生成 Business Logic Review。"));
    }
    if (parsed.data.businessLogicProposal === null || parsed.data.planRiskProposal !== null) {
      return failure(invalidAgentOutput("Business Logic 阶段必须且只能返回对应 Proposal。"));
    }
    return parseBusinessLogicProposal(parsed.data.businessLogicProposal);
  }

  if (parsed.data.planRiskProposal === null || parsed.data.businessLogicProposal !== null) {
    return failure(invalidAgentOutput("PlanRisk 阶段必须且只能返回对应 Proposal。"));
  }
  const proposal = parsePlanRiskProposalDraft(parsed.data.planRiskProposal);
  if (proposal.status === ResultStatus.Failure) return proposal;
  if (proposal.value.payload.historicalLogicChange !== hasApprovedBusinessLogic) {
    return failure(
      invalidAgentOutput(
        hasApprovedBusinessLogic
          ? "G2 已批准后 PlanRisk 必须声明历史逻辑变更。"
          : "历史逻辑变更必须先生成并确认 Business Logic Review。",
      ),
    );
  }
  return success({ kind: PlanRiskReviewKind.PlanRisk, proposal: proposal.value });
}

/** 解析尚未绑定内部 Artifact Digest 的 PlanRisk Draft。 */
export function parsePlanRiskProposalDraft(
  input: unknown,
): Result<PlanRiskProposalDraft, HarnessError> {
  const parsed = planRiskProposalDraftSchema.safeParse(input);
  if (!parsed.success) return failure(invalidPlan("PlanRisk Draft 不符合严格契约。"));

  const payload = parsed.data.payload;
  if (payload.riskLevel === RiskLevel.R4) {
    return failure(
      new HarnessError(HarnessErrorCode.OperationForbidden, "R4 计划禁止进入实现流程。"),
    );
  }
  if (payload.historicalLogicChange && payload.riskLevel !== RiskLevel.R3) {
    return failure(invalidPlan("历史业务逻辑变更必须声明为 R3。"));
  }
  if (
    (payload.riskLevel === RiskLevel.R0 || payload.riskLevel === RiskLevel.R1) &&
    payload.riskOperations.length > 0
  ) {
    return failure(invalidPlan("R0/R1 计划不能包含风险操作。"));
  }
  if (payload.riskLevel === RiskLevel.R0 && payload.writeSet.length > 0) {
    return failure(invalidPlan("R0 只读计划不能声明 Write Set。"));
  }
  if (!hasSequentialSteps(payload.steps.map((step) => step.order))) {
    return failure(invalidPlan("PlanRisk 步骤必须从 1 开始连续编号。"));
  }
  if (!hasUniqueItems(payload.readSet) || !hasUniqueItems(payload.writeSet)) {
    return failure(invalidPlan("PlanRisk Read Set 和 Write Set 不能包含重复路径。"));
  }

  return success({
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: {
      ...payload,
      requiredGates:
        payload.riskLevel === RiskLevel.R2 || payload.riskLevel === RiskLevel.R3
          ? [GateId.G4RiskOperation]
          : [],
    },
  });
}

function parseBusinessLogicProposal(
  input: unknown,
): Result<ParsedPlanRiskAgentCandidate, HarnessError> {
  const parsed = parseArtifactProposal(input);
  if (parsed.status === ResultStatus.Failure) {
    return failure(invalidAgentOutput("Business Logic Proposal 不符合 Artifact 契约。"));
  }
  if (parsed.value.artifactType !== ArtifactType.BusinessLogicChangeContract) {
    return failure(invalidAgentOutput("Business Logic 阶段返回了错误 Artifact 类型。"));
  }
  const proposal = parsed.value;
  if (proposal.payload.unknowns.length > MAX_BUSINESS_LOGIC_HUMAN_QUESTIONS) {
    return failure(invalidAgentOutput("Business Logic Human Battle 问题超过单轮上限。"));
  }
  if (!hasUniqueItems(proposal.payload.unknowns)) {
    return failure(invalidAgentOutput("Business Logic Proposal 包含重复问题。"));
  }
  const evidence = validateArtifactEvidence(proposal);
  return evidence.status === ResultStatus.Failure
    ? evidence
    : success({ kind: PlanRiskReviewKind.BusinessLogic, proposal });
}

function hasSequentialSteps(orders: readonly number[]): boolean {
  return orders.every((order, index) => order === index + 1);
}

function hasUniqueItems(items: readonly string[]): boolean {
  return new Set(items).size === items.length;
}

function invalidAgentOutput(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, message, {
    source: "plan_risk_agent_output",
  });
}

function invalidPlan(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, message, {
    source: "plan_risk_review",
  });
}
