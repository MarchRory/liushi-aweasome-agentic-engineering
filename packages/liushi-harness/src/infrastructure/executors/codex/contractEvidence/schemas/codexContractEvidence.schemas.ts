import { z } from "zod";

import {
  ExecutorCapability,
  ExecutorEvidenceLocatorKind,
  ExecutorEvidenceOutcome,
  executorCapabilityEvidenceSchema,
  executorHostScopeSchema,
} from "#domain/executorCompatibility/index.js";

import { CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION } from "../constants/index.js";
import { CodexContractCheckOutcome } from "../enums/index.js";

const safeIdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9._+:@/-]+$/u);

const contentDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

const caseDefinitionSchema = z
  .object({
    caseId: safeIdentifierSchema,
    capability: z.enum(ExecutorCapability),
    checkIds: z.array(safeIdentifierSchema).min(1).max(16),
  })
  .strict();

const suiteDescriptorSchema = z
  .object({
    suiteId: safeIdentifierSchema,
    version: safeIdentifierSchema,
    cases: z.array(caseDefinitionSchema).length(5),
    definitionDigest: contentDigestSchema,
  })
  .strict();

const checkResultSchema = z
  .object({
    checkId: safeIdentifierSchema,
    outcome: z.enum(CodexContractCheckOutcome),
  })
  .strict();

const caseResultSchema = z
  .object({
    caseId: safeIdentifierSchema,
    capability: z.enum(ExecutorCapability),
    outcome: z
      .enum(ExecutorEvidenceOutcome)
      .refine(
        (value) =>
          value === ExecutorEvidenceOutcome.Passed || value === ExecutorEvidenceOutcome.Failed,
      ),
    checks: z.array(checkResultSchema).min(1).max(16),
  })
  .strict();

/** Codex Contract Evidence Projector 输入的严格运行时 Schema。 */
export const codexContractEvidenceProjectInputSchema = z
  .object({
    scope: executorHostScopeSchema,
    hostArtifactDigest: contentDigestSchema,
    observationAnchor: z.string().datetime({ offset: true }),
    artifactLocatorKind: z.enum(ExecutorEvidenceLocatorKind),
  })
  .strict();

/** Codex Contract Evidence Artifact 的严格运行时 Schema。 */
export const codexContractEvidenceArtifactSchema = z
  .object({
    schemaVersion: z.literal(CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION),
    profileId: safeIdentifierSchema,
    scope: executorHostScopeSchema,
    hostArtifactDigest: contentDigestSchema,
    suite: suiteDescriptorSchema,
    observationAnchor: z.string().datetime({ offset: true }),
    caseResults: z.array(caseResultSchema).length(5),
  })
  .strict();

/** 持久化 Codex Contract Evidence Projection 的严格运行时 Schema。 */
export const codexContractEvidenceProjectionSchema = z
  .object({
    artifact: codexContractEvidenceArtifactSchema,
    artifactDigest: contentDigestSchema,
    evidence: z.array(executorCapabilityEvidenceSchema).length(5),
  })
  .strict();
