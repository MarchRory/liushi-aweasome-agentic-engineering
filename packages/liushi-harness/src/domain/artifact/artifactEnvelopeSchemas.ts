import { z } from "zod";

import {
  ARTIFACT_SCHEMA_VERSION,
  ResultStatus,
  actorRefSchema,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import { ARTIFACT_ID_PATTERN } from "./artifactConstants.js";
import {
  type BusinessLogicChangeContractArtifact,
  type ArtifactEnvelope,
  type PlanRiskArtifact,
  type RequirementContractArtifact,
  type SupportedArtifact,
} from "./artifactContracts.js";
import type { ArtifactId } from "./artifactId.js";
import { parseArtifactDigest, type ArtifactDigest } from "./artifactDigest.js";
import { ArtifactStatus, ArtifactType } from "./artifactEnums.js";
import { createArtifactSchemaError } from "./artifactSchemaError.js";
import {
  businessLogicPayloadSchema,
  mapBusinessLogicPayload,
  mapPlanRiskPayload,
  mapRequirementPayload,
  planRiskPayloadSchema,
  requirementPayloadSchema,
} from "./artifactSchemas.js";

const artifactIdSchema = z
  .string()
  .regex(ARTIFACT_ID_PATTERN)
  .transform((value) => value as ArtifactId);
const artifactDigestSchema = z
  .string()
  .refine((value) => parseArtifactDigest(value).status === ResultStatus.Success)
  .transform((value) => value as ArtifactDigest);
const taskIdSchema = z.string().transform((value, context) => {
  const parsed = parseTaskId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});
const workspaceIdSchema = z.string().transform((value, context) => {
  const parsed = parseWorkspaceId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const envelopeFields = {
  schemaVersion: z.literal(ARTIFACT_SCHEMA_VERSION),
  artifactId: artifactIdSchema,
  workspaceId: workspaceIdSchema,
  taskId: taskIdSchema,
  revision: z.number().int().positive(),
  parentDigest: artifactDigestSchema.optional(),
  status: z.enum(ArtifactStatus),
  createdAt: z.string().datetime(),
  createdBy: actorRefSchema,
  digest: artifactDigestSchema,
};

const requirementArtifactSchema = z
  .object({
    ...envelopeFields,
    artifactType: z.literal(ArtifactType.RequirementContract),
    payload: requirementPayloadSchema,
  })
  .strict();
const businessLogicArtifactSchema = z
  .object({
    ...envelopeFields,
    artifactType: z.literal(ArtifactType.BusinessLogicChangeContract),
    payload: businessLogicPayloadSchema,
  })
  .strict();
const planRiskArtifactSchema = z
  .object({
    ...envelopeFields,
    artifactType: z.literal(ArtifactType.PlanRisk),
    payload: planRiskPayloadSchema,
  })
  .strict();

/** 当前 Harness 支持的 Artifact Envelope 严格 Schema。 */
export const supportedArtifactSchema = z
  .discriminatedUnion("artifactType", [
    requirementArtifactSchema,
    businessLogicArtifactSchema,
    planRiskArtifactSchema,
  ])
  .superRefine((artifact, context) => {
    const parentMatchesRevision =
      (artifact.revision === 1 && artifact.parentDigest === undefined) ||
      (artifact.revision > 1 && artifact.parentDigest !== undefined);
    if (!parentMatchesRevision) {
      context.addIssue({
        code: "custom",
        message: "Artifact parentDigest must match its revision.",
        path: ["parentDigest"],
      });
    }
  });

/** 校验未知输入并返回完整的正式 Artifact Envelope。 */
export function parseSupportedArtifact(input: unknown): Result<SupportedArtifact, HarnessError> {
  const parsed = supportedArtifactSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      createArtifactSchemaError(
        parsed.error,
        "Artifact envelope does not match the supported schema.",
      ),
    );
  }

  switch (parsed.data.artifactType) {
    case ArtifactType.RequirementContract:
      return success(mapRequirementArtifact(parsed.data));
    case ArtifactType.BusinessLogicChangeContract:
      return success(mapBusinessLogicArtifact(parsed.data));
    case ArtifactType.PlanRisk:
      return success(mapPlanRiskArtifact(parsed.data));
  }
}

function mapRequirementArtifact(
  artifact: z.infer<typeof requirementArtifactSchema>,
): RequirementContractArtifact {
  return {
    ...mapArtifactCommon(artifact),
    artifactType: ArtifactType.RequirementContract,
    payload: mapRequirementPayload(artifact.payload),
  };
}

function mapBusinessLogicArtifact(
  artifact: z.infer<typeof businessLogicArtifactSchema>,
): BusinessLogicChangeContractArtifact {
  return {
    ...mapArtifactCommon(artifact),
    artifactType: ArtifactType.BusinessLogicChangeContract,
    payload: mapBusinessLogicPayload(artifact.payload),
  };
}

function mapPlanRiskArtifact(artifact: z.infer<typeof planRiskArtifactSchema>): PlanRiskArtifact {
  return {
    ...mapArtifactCommon(artifact),
    artifactType: ArtifactType.PlanRisk,
    payload: mapPlanRiskPayload(artifact.payload),
  };
}

/** Artifact 各封闭 Payload 共用的 Envelope 字段。 */
type ArtifactCommonFields = Omit<ArtifactEnvelope<ArtifactType, unknown>, "payload">;

function mapArtifactCommon(
  artifact: z.infer<typeof supportedArtifactSchema>,
): ArtifactCommonFields {
  return {
    schemaVersion: artifact.schemaVersion,
    artifactId: artifact.artifactId,
    artifactType: artifact.artifactType,
    workspaceId: artifact.workspaceId,
    taskId: artifact.taskId,
    revision: artifact.revision,
    ...(artifact.parentDigest === undefined ? {} : { parentDigest: artifact.parentDigest }),
    status: artifact.status,
    createdAt: artifact.createdAt,
    createdBy: artifact.createdBy,
    digest: artifact.digest,
  };
}
