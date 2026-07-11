import { z } from "zod";

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
} from "../constants/index.js";
import type {
  BusinessLogicChangeContractPayload,
  BusinessLogicCurrentBehavior,
  PlanRiskPayload,
  RequirementContractPayload,
} from "../contracts/index.js";
import {
  artifactDigestSchema,
  nonBlank,
  pathArraySchema,
  textArraySchema,
} from "./schemaPrimitives.js";

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

/** 灏?Requirement Payload Schema 杈撳嚭鏄犲皠涓?exact-optional 棰嗗煙濂戠害銆?*/
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

/** 灏?Business Logic Payload Schema 杈撳嚭鏄犲皠涓?exact-optional 棰嗗煙濂戠害銆?*/
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

/** 灏?PlanRisk Payload Schema 杈撳嚭鏄犲皠涓?exact-optional 棰嗗煙濂戠害銆?*/
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
