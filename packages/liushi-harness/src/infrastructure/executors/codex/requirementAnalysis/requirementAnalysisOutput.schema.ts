import {
  ArtifactStatus,
  ArtifactType,
  requirementPayloadSchema,
  type RequirementContractProposal,
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

const codexRequirementAnalysisOutputSchema = z
  .object({
    artifactType: z.literal(ArtifactType.RequirementContract),
    status: z.literal(ArtifactStatus.Proposed),
    payload: requirementPayloadSchema.extend({
      evidence: z.array(codexEvidenceRefSchema),
    }),
  })
  .strict();

/** 生成符合 Codex Strict Structured Outputs 约束的 JSON Schema。 */
export function createRequirementAnalysisOutputJsonSchema(): object {
  const schema = z.toJSONSchema(codexRequirementAnalysisOutputSchema);
  Reflect.deleteProperty(schema, "$schema");
  return schema;
}

/** 校验 Codex 线格式，并将可空字段还原为领域契约的可选字段。 */
export function parseRequirementAnalysisOutput(
  input: unknown,
): RequirementContractProposal | undefined {
  const parsed = codexRequirementAnalysisOutputSchema.safeParse(input);
  if (!parsed.success) return undefined;

  return {
    artifactType: parsed.data.artifactType,
    status: parsed.data.status,
    payload: {
      ...parsed.data.payload,
      evidence: parsed.data.payload.evidence.map((evidence) => ({
        evidenceId: evidence.evidenceId,
        kind: evidence.kind,
        source: evidence.source,
        title: evidence.title,
        ...(evidence.locator === null ? {} : { locator: evidence.locator }),
        ...(evidence.revision === null ? {} : { revision: evidence.revision }),
        ...(evidence.observedAt === null ? {} : { observedAt: evidence.observedAt }),
        ...(evidence.contentDigest === null ? {} : { contentDigest: evidence.contentDigest }),
      })),
    },
  };
}
