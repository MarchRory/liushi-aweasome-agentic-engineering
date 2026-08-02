import {
  MAX_BUSINESS_LOGIC_HUMAN_QUESTIONS,
  PlanRiskReviewKind,
  type PlanRiskProposalDraft,
} from "#application/index.js";
import {
  ArtifactStatus,
  ArtifactType,
  businessLogicPayloadSchema,
  planRiskPayloadSchema,
  type BusinessLogicChangeContractProposal,
} from "#domain/artifact/index.js";
import { evidenceRefSchema } from "#domain/evidence/index.js";
import { z } from "zod";

const codexEvidenceRefSchema = z
  .object({
    evidenceId: evidenceRefSchema.shape.evidenceId,
    kind: evidenceRefSchema.shape.kind,
    source: evidenceRefSchema.shape.source,
    title: evidenceRefSchema.shape.title,
    locator: evidenceRefSchema.shape.locator.unwrap().nullable(),
    revision: evidenceRefSchema.shape.revision.unwrap().nullable(),
    observedAt: evidenceRefSchema.shape.observedAt.unwrap().nullable(),
    contentDigest: evidenceRefSchema.shape.contentDigest.unwrap().nullable(),
  })
  .strict();

const codexBusinessLogicProposalSchema = z
  .object({
    artifactType: z.literal(ArtifactType.BusinessLogicChangeContract),
    status: z.literal(ArtifactStatus.Proposed),
    payload: businessLogicPayloadSchema.extend({
      evidence: z.array(codexEvidenceRefSchema),
      unknowns: businessLogicPayloadSchema.shape.unknowns.max(MAX_BUSINESS_LOGIC_HUMAN_QUESTIONS),
    }),
  })
  .strict();

const codexPlanRiskProposalSchema = z
  .object({
    artifactType: z.literal(ArtifactType.PlanRisk),
    status: z.literal(ArtifactStatus.Proposed),
    payload: z
      .object({
        steps: planRiskPayloadSchema.shape.steps,
        readSet: planRiskPayloadSchema.shape.readSet,
        writeSet: planRiskPayloadSchema.shape.writeSet,
        risks: planRiskPayloadSchema.shape.risks,
        riskLevel: planRiskPayloadSchema.shape.riskLevel,
        historicalLogicChange: planRiskPayloadSchema.shape.historicalLogicChange,
        riskOperations: planRiskPayloadSchema.shape.riskOperations,
        testPlan: planRiskPayloadSchema.shape.testPlan,
        rollbackPlan: planRiskPayloadSchema.shape.rollbackPlan,
        requiredGates: planRiskPayloadSchema.shape.requiredGates,
      })
      .strict(),
  })
  .strict();

const codexPlanRiskAnalysisOutputSchema = z
  .object({
    analysisKind: z.enum(PlanRiskReviewKind),
    businessLogicProposal: codexBusinessLogicProposalSchema.nullable(),
    planRiskProposal: codexPlanRiskProposalSchema.nullable(),
  })
  .strict();

/** Codex 线格式恢复为应用语义后的 Planning 候选。 */
export interface CodexPlanRiskAnalysisOutput {
  /** 当前输出对应的 Planning Review 类别。 */
  readonly analysisKind: PlanRiskReviewKind;
  /** Business Logic 阶段的 Proposal；其他阶段为 null。 */
  readonly businessLogicProposal: BusinessLogicChangeContractProposal | null;
  /** PlanRisk 阶段的无 Digest Draft；其他阶段为 null。 */
  readonly planRiskProposal: PlanRiskProposalDraft | null;
}

/** 生成适配 Codex Strict Structured Outputs 的 JSON Schema。 */
export function createPlanRiskAnalysisOutputJsonSchema(): object {
  const schema = z.toJSONSchema(codexPlanRiskAnalysisOutputSchema);
  Reflect.deleteProperty(schema, "$schema");
  return schema;
}

/** 校验 Codex 输出，并将在线 nullable Evidence 恢复为应用层 optional 字段。 */
export function parsePlanRiskAnalysisOutput(
  input: unknown,
): CodexPlanRiskAnalysisOutput | undefined {
  const parsed = codexPlanRiskAnalysisOutputSchema.safeParse(input);
  if (!parsed.success) return undefined;

  const businessLogicProposal = parsed.data.businessLogicProposal;
  const planRiskProposal = parsed.data.planRiskProposal;
  return {
    analysisKind: parsed.data.analysisKind,
    businessLogicProposal:
      businessLogicProposal === null
        ? null
        : {
            artifactType: businessLogicProposal.artifactType,
            status: businessLogicProposal.status,
            payload: {
              ...businessLogicProposal.payload,
              evidence: businessLogicProposal.payload.evidence.map(mapEvidenceRef),
            },
          },
    planRiskProposal:
      planRiskProposal === null
        ? null
        : {
            artifactType: planRiskProposal.artifactType,
            status: planRiskProposal.status,
            payload: planRiskProposal.payload,
          },
  };
}

function mapEvidenceRef(
  evidence: z.infer<typeof codexEvidenceRefSchema>,
): BusinessLogicChangeContractProposal["payload"]["evidence"][number] {
  return {
    evidenceId: evidence.evidenceId,
    kind: evidence.kind,
    source: evidence.source,
    title: evidence.title,
    ...(evidence.locator === null ? {} : { locator: evidence.locator }),
    ...(evidence.revision === null ? {} : { revision: evidence.revision }),
    ...(evidence.observedAt === null ? {} : { observedAt: evidence.observedAt }),
    ...(evidence.contentDigest === null ? {} : { contentDigest: evidence.contentDigest }),
  };
}
