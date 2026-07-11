import { z } from "zod";

import type { HarnessError } from "#common/index.js";
import { ResultStatus, failure, success, type Result } from "#common/index.js";
import {
  claimSchema,
  evidenceRefSchema,
  type Claim,
  type EvidenceRef,
} from "#domain/evidence/index.js";
import { GateId, RiskLevel } from "#domain/policy/index.js";

import {
  MAX_ARTIFACT_LIST_ITEMS,
  MAX_ARTIFACT_PATH_LENGTH,
  MAX_ARTIFACT_TEXT_LENGTH,
} from "./artifactConstants.js";
import { parseArtifactDigest, type ArtifactDigest } from "./artifactDigest.js";
import {
  type ArtifactProposal,
  type BusinessLogicChangeContractPayload,
  type BusinessLogicChangeContractProposal,
  type BusinessLogicCurrentBehavior,
  type PlanRiskPayload,
  type PlanRiskProposal,
  type RequirementContractPayload,
  type RequirementContractProposal,
} from "./artifactContracts.js";
import { ArtifactStatus, ArtifactType } from "./artifactEnums.js";
import { createArtifactSchemaError } from "./artifactSchemaError.js";

const nonBlank = (maxLength: number): z.ZodString =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim());

const textArraySchema = z.array(nonBlank(MAX_ARTIFACT_TEXT_LENGTH)).max(MAX_ARTIFACT_LIST_ITEMS);
const pathArraySchema = z.array(nonBlank(MAX_ARTIFACT_PATH_LENGTH)).max(MAX_ARTIFACT_LIST_ITEMS);
const artifactDigestSchema = z
  .string()
  .refine((value) => parseArtifactDigest(value).status === ResultStatus.Success)
  .transform((value) => value as ArtifactDigest);

const currentBehaviorSchema = z
  .object({
    facts: z.array(claimSchema),
    inferences: z.array(claimSchema),
  })
  .strict();

export const requirementPayloadSchema = z
  .object({
    problem: nonBlank(MAX_ARTIFACT_TEXT_LENGTH),
    goals: textArraySchema,
    nonGoals: textArraySchema,
    observableBehaviors: textArraySchema,
    acceptanceCriteria: textArraySchema,
    includedScopes: textArraySchema,
    forbiddenScopes: textArraySchema,
    repositories: textArraySchema,
    edgeCases: textArraySchema,
    compatibilityConstraints: textArraySchema,
    evidence: z.array(evidenceRefSchema),
    claims: z.array(claimSchema),
    unknowns: textArraySchema,
    humanAnswers: textArraySchema,
  })
  .strict();

export const businessLogicPayloadSchema = z
  .object({
    currentBehavior: currentBehaviorSchema,
    plannedBehavior: textArraySchema,
    differences: textArraySchema,
    affectedConsumers: textArraySchema,
    invariants: textArraySchema,
    rollback: textArraySchema,
    evidence: z.array(evidenceRefSchema),
    unknowns: textArraySchema,
  })
  .strict();

const planRiskStepSchema = z
  .object({
    order: z.number().int().positive(),
    action: nonBlank(MAX_ARTIFACT_TEXT_LENGTH),
  })
  .strict();

const planRiskItemSchema = z
  .object({
    description: nonBlank(MAX_ARTIFACT_TEXT_LENGTH),
    mitigation: nonBlank(MAX_ARTIFACT_TEXT_LENGTH),
  })
  .strict();

const riskOperationSchema = z
  .object({
    target: nonBlank(MAX_ARTIFACT_PATH_LENGTH),
    reason: nonBlank(MAX_ARTIFACT_TEXT_LENGTH),
  })
  .strict();

export const planRiskPayloadSchema = z
  .object({
    steps: z.array(planRiskStepSchema).max(MAX_ARTIFACT_LIST_ITEMS),
    readSet: pathArraySchema,
    writeSet: pathArraySchema,
    risks: z.array(planRiskItemSchema).max(MAX_ARTIFACT_LIST_ITEMS),
    riskLevel: z.enum(RiskLevel),
    historicalLogicChange: z.boolean(),
    riskOperations: z.array(riskOperationSchema).max(MAX_ARTIFACT_LIST_ITEMS),
    testPlan: textArraySchema,
    rollbackPlan: textArraySchema,
    requiredGates: z.array(z.enum(GateId)).max(MAX_ARTIFACT_LIST_ITEMS),
    businessLogicArtifactDigest: artifactDigestSchema.optional(),
  })
  .strict()
  .refine(
    (payload) =>
      !payload.historicalLogicChange || payload.businessLogicArtifactDigest !== undefined,
    {
      message: "historicalLogicChange=true requires businessLogicArtifactDigest.",
      path: ["businessLogicArtifactDigest"],
    },
  );

const requirementProposalSchema = z
  .object({
    artifactType: z.literal(ArtifactType.RequirementContract),
    status: z.literal(ArtifactStatus.Proposed),
    payload: requirementPayloadSchema,
  })
  .strict();

const businessLogicProposalSchema = z
  .object({
    artifactType: z.literal(ArtifactType.BusinessLogicChangeContract),
    status: z.literal(ArtifactStatus.Proposed),
    payload: businessLogicPayloadSchema,
  })
  .strict();

const planRiskProposalSchema = z
  .object({
    artifactType: z.literal(ArtifactType.PlanRisk),
    status: z.literal(ArtifactStatus.Proposed),
    payload: planRiskPayloadSchema,
  })
  .strict();

const artifactProposalSchema = z.discriminatedUnion("artifactType", [
  requirementProposalSchema,
  businessLogicProposalSchema,
  planRiskProposalSchema,
]);

/** 校验未知输入并返回严格 Artifact Proposal。 */
export function parseArtifactProposal(input: unknown): Result<ArtifactProposal, HarnessError> {
  const parsed = artifactProposalSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      createArtifactSchemaError(
        parsed.error,
        "Artifact proposal does not match the supported schema.",
      ),
    );
  }

  switch (parsed.data.artifactType) {
    case ArtifactType.RequirementContract:
      return success(mapRequirementProposal(parsed.data));
    case ArtifactType.BusinessLogicChangeContract:
      return success(mapBusinessLogicProposal(parsed.data));
    case ArtifactType.PlanRisk:
      return success(mapPlanRiskProposal(parsed.data));
  }
}

function mapRequirementProposal(
  proposal: z.infer<typeof requirementProposalSchema>,
): RequirementContractProposal {
  return {
    artifactType: proposal.artifactType,
    status: proposal.status,
    payload: mapRequirementPayload(proposal.payload),
  };
}

/** 将 Requirement Payload Schema 输出映射为 exact-optional 领域契约。 */
export function mapRequirementPayload(
  payload: z.infer<typeof requirementPayloadSchema>,
): RequirementContractPayload {
  return {
    problem: payload.problem,
    goals: payload.goals,
    nonGoals: payload.nonGoals,
    observableBehaviors: payload.observableBehaviors,
    acceptanceCriteria: payload.acceptanceCriteria,
    includedScopes: payload.includedScopes,
    forbiddenScopes: payload.forbiddenScopes,
    repositories: payload.repositories,
    edgeCases: payload.edgeCases,
    compatibilityConstraints: payload.compatibilityConstraints,
    evidence: payload.evidence.map(mapEvidenceRef),
    claims: payload.claims.map(mapClaim),
    unknowns: payload.unknowns,
    humanAnswers: payload.humanAnswers,
  };
}

function mapBusinessLogicProposal(
  proposal: z.infer<typeof businessLogicProposalSchema>,
): BusinessLogicChangeContractProposal {
  return {
    artifactType: proposal.artifactType,
    status: proposal.status,
    payload: mapBusinessLogicPayload(proposal.payload),
  };
}

/** 将 Business Logic Payload Schema 输出映射为 exact-optional 领域契约。 */
export function mapBusinessLogicPayload(
  payload: z.infer<typeof businessLogicPayloadSchema>,
): BusinessLogicChangeContractPayload {
  return {
    currentBehavior: mapCurrentBehavior(payload.currentBehavior),
    plannedBehavior: payload.plannedBehavior,
    differences: payload.differences,
    affectedConsumers: payload.affectedConsumers,
    invariants: payload.invariants,
    rollback: payload.rollback,
    evidence: payload.evidence.map(mapEvidenceRef),
    unknowns: payload.unknowns,
  };
}

function mapCurrentBehavior(
  currentBehavior: z.infer<typeof currentBehaviorSchema>,
): BusinessLogicCurrentBehavior {
  return {
    facts: currentBehavior.facts.map(mapClaim),
    inferences: currentBehavior.inferences.map(mapClaim),
  };
}

function mapPlanRiskProposal(proposal: z.infer<typeof planRiskProposalSchema>): PlanRiskProposal {
  return {
    artifactType: proposal.artifactType,
    status: proposal.status,
    payload: mapPlanRiskPayload(proposal.payload),
  };
}

/** 将 PlanRisk Payload Schema 输出映射为 exact-optional 领域契约。 */
export function mapPlanRiskPayload(
  payload: z.infer<typeof planRiskPayloadSchema>,
): PlanRiskPayload {
  return {
    steps: payload.steps,
    readSet: payload.readSet,
    writeSet: payload.writeSet,
    risks: payload.risks,
    riskLevel: payload.riskLevel,
    historicalLogicChange: payload.historicalLogicChange,
    riskOperations: payload.riskOperations,
    testPlan: payload.testPlan,
    rollbackPlan: payload.rollbackPlan,
    requiredGates: payload.requiredGates,
    ...(payload.businessLogicArtifactDigest === undefined
      ? {}
      : { businessLogicArtifactDigest: payload.businessLogicArtifactDigest }),
  };
}

function mapEvidenceRef(evidence: z.infer<typeof evidenceRefSchema>): EvidenceRef {
  return {
    evidenceId: evidence.evidenceId,
    kind: evidence.kind,
    source: evidence.source,
    title: evidence.title,
    ...(evidence.locator === undefined ? {} : { locator: evidence.locator }),
    ...(evidence.revision === undefined ? {} : { revision: evidence.revision }),
    ...(evidence.observedAt === undefined ? {} : { observedAt: evidence.observedAt }),
    ...(evidence.contentDigest === undefined ? {} : { contentDigest: evidence.contentDigest }),
  };
}

function mapClaim(claim: z.infer<typeof claimSchema>): Claim {
  return {
    claimId: claim.claimId,
    statement: claim.statement,
    classification: claim.classification,
    evidenceIds: claim.evidenceIds,
  };
}
