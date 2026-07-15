import { z } from "zod";

import {
  ExecutorEvidenceOutcome,
  executorHostScopeSchema,
} from "#domain/executorCompatibility/index.js";

import { CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION } from "../constants/index.js";
import { CodexCompatibilityObservationKind } from "../enums/index.js";
import {
  codexContentDigestSchema,
  codexObservedAtSchema,
  codexSafeIdentifierSchema,
} from "./codexCompatibilitySchemaPrimitives.js";

const sourceDigestsSchema = z
  .object({
    prepareManifest: codexContentDigestSchema,
    activationPlan: codexContentDigestSchema,
    staticProbe: codexContentDigestSchema,
    hostResult: codexContentDigestSchema,
    activation: codexContentDigestSchema,
  })
  .strict();

const observationSchema = z
  .object({
    kind: z.enum(CodexCompatibilityObservationKind),
    observedAt: codexObservedAtSchema,
    outcome: z.enum(ExecutorEvidenceOutcome),
    checkIds: z.array(codexSafeIdentifierSchema).min(1).max(128),
  })
  .strict();

/** 脱敏 Codex Compatibility Artifact 的运行时 Schema。 */
export const codexCompatibilityEvidenceArtifactSchema = z
  .object({
    schemaVersion: z.literal(CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION),
    profileId: codexSafeIdentifierSchema,
    scope: executorHostScopeSchema,
    sourceDigests: sourceDigestsSchema,
    observations: z.array(observationSchema).length(2),
  })
  .strict();
