import { z } from "zod";

import type { HarnessError, Result } from "#common/index.js";
import { failure, success } from "#common/index.js";

import type {
  ArtifactProposal,
  BusinessLogicChangeContractProposal,
  PlanRiskProposal,
  ProjectProfileProposal,
  RequirementContractProposal,
} from "../contracts/index.js";
import { ArtifactStatus, ArtifactType } from "../enums/index.js";
import {
  businessLogicPayloadSchema,
  mapBusinessLogicPayload,
  mapPlanRiskPayload,
  mapRequirementPayload,
  planRiskPayloadSchema,
  requirementPayloadSchema,
} from "./payloadSchemas.js";
import {
  mapProjectProfileProposalPayload,
  projectProfileProposalPayloadSchema,
} from "./profileProposalSchemas.js";
import { createArtifactSchemaError } from "./schemaError.js";

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

const projectProfileProposalSchema = z
  .object({
    artifactType: z.literal(ArtifactType.ProjectProfileProposal),
    status: z.literal(ArtifactStatus.Proposed),
    payload: projectProfileProposalPayloadSchema,
  })
  .strict();

const artifactProposalSchema = z.discriminatedUnion("artifactType", [
  requirementProposalSchema,
  businessLogicProposalSchema,
  planRiskProposalSchema,
  projectProfileProposalSchema,
]);

/** 鏍￠獙鏈煡杈撳叆骞惰繑鍥炰弗鏍?Artifact Proposal銆?*/
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
    case ArtifactType.ProjectProfileProposal:
      return success(mapProjectProfileProposal(parsed.data));
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

function mapBusinessLogicProposal(
  proposal: z.infer<typeof businessLogicProposalSchema>,
): BusinessLogicChangeContractProposal {
  return {
    artifactType: proposal.artifactType,
    status: proposal.status,
    payload: mapBusinessLogicPayload(proposal.payload),
  };
}

function mapPlanRiskProposal(proposal: z.infer<typeof planRiskProposalSchema>): PlanRiskProposal {
  return {
    artifactType: proposal.artifactType,
    status: proposal.status,
    payload: mapPlanRiskPayload(proposal.payload),
  };
}

function mapProjectProfileProposal(
  proposal: z.infer<typeof projectProfileProposalSchema>,
): ProjectProfileProposal {
  return {
    artifactType: proposal.artifactType,
    status: proposal.status,
    payload: mapProjectProfileProposalPayload(proposal.payload),
  };
}
