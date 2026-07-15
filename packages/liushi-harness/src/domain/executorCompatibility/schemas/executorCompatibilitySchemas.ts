import { z } from "zod";

import {
  EXECUTOR_CAPABILITY_EVIDENCE_MAX_CHECKS,
  EXECUTOR_COMPATIBILITY_IDENTIFIER_MAX_LENGTH,
} from "../constants/index.js";
import {
  ExecutorAdapterKind,
  ExecutorArchitecture,
  ExecutorCapability,
  ExecutorCapabilityQualifierKind,
  ExecutorCapabilitySupport,
  ExecutorDistribution,
  ExecutorEvidenceKind,
  ExecutorEvidenceLocatorKind,
  ExecutorEvidenceOutcome,
  ExecutorHostSurface,
  ExecutorOperatingSystem,
  ExecutorPermissionMode,
  ExecutorRequirementStatus,
  ExecutorScopeField,
  ExecutorSupportLevel,
} from "../enums/index.js";

const safeIdentifierSchema = z
  .string()
  .min(1)
  .max(EXECUTOR_COMPATIBILITY_IDENTIFIER_MAX_LENGTH)
  .regex(/^[A-Za-z0-9._+:@/-]+$/u);

const contentDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

const requirementIdentitySchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => !value.includes("\0"));

const evidenceLocatorSchema = z
  .object({
    kind: z.enum(ExecutorEvidenceLocatorKind),
    value: z
      .string()
      .min(1)
      .max(512)
      .refine((value) => value === value.trim() && !value.includes("\0")),
  })
  .strict();

/** 精确执行器 Host Scope 的运行时 Schema。 */
export const executorHostScopeSchema = z
  .object({
    adapterKind: z.enum(ExecutorAdapterKind),
    distribution: z.enum(ExecutorDistribution),
    adapterDigest: contentDigestSchema,
    executorVersion: safeIdentifierSchema,
    surface: z.enum(ExecutorHostSurface),
    operatingSystem: z.enum(ExecutorOperatingSystem),
    architecture: z.enum(ExecutorArchitecture),
    modelId: safeIdentifierSchema.optional(),
    permissionMode: z.enum(ExecutorPermissionMode).optional(),
    configurationDigest: contentDigestSchema.optional(),
  })
  .strict();

/** 能力覆盖限定符的运行时 Schema。 */
export const executorCapabilityQualifierSchema = z
  .object({
    kind: z.enum(ExecutorCapabilityQualifierKind),
    value: safeIdentifierSchema,
  })
  .strict();

const evidenceSourceSchema = z
  .object({
    artifactDigest: contentDigestSchema,
    locator: evidenceLocatorSchema,
    schemaVersion: safeIdentifierSchema,
    checkIds: z.array(safeIdentifierSchema).min(1).max(EXECUTOR_CAPABILITY_EVIDENCE_MAX_CHECKS),
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict();

/** 平台归一化能力证据的运行时 Schema。 */
export const executorCapabilityEvidenceSchema = z
  .object({
    schemaVersion: safeIdentifierSchema,
    scope: executorHostScopeSchema,
    capability: z.enum(ExecutorCapability),
    kind: z.enum(ExecutorEvidenceKind),
    outcome: z.enum(ExecutorEvidenceOutcome),
    qualifiers: z.array(executorCapabilityQualifierSchema),
    source: evidenceSourceSchema,
    evidenceDigest: contentDigestSchema,
  })
  .strict();

const capabilityRequirementSchema = z
  .object({
    capability: z.enum(ExecutorCapability),
    qualifiers: z.array(executorCapabilityQualifierSchema),
    evidenceKinds: z.array(z.enum(ExecutorEvidenceKind)).min(1),
  })
  .strict();

const tierScopeRequirementsSchema = z
  .object({
    modelId: z.boolean(),
    permissionMode: z.boolean(),
    configurationDigest: z.boolean(),
  })
  .strict();

const supportTierPolicySchema = z
  .object({
    level: z.enum(ExecutorSupportLevel),
    scopeRequirements: tierScopeRequirementsSchema,
    requirements: z.array(capabilityRequirementSchema).min(1),
  })
  .strict();

/** 执行器支持 Policy 的运行时 Schema。 */
export const executorCompatibilityPolicySchema = z
  .object({
    schemaVersion: safeIdentifierSchema,
    policyId: safeIdentifierSchema,
    profileId: safeIdentifierSchema,
    tiers: z.array(supportTierPolicySchema).min(1),
  })
  .strict();

const evidenceKindAssessmentSchema = z
  .object({
    kind: z.enum(ExecutorEvidenceKind),
    status: z.enum(ExecutorRequirementStatus),
    evidenceDigests: z.array(contentDigestSchema),
  })
  .strict();

const requirementAssessmentSchema = z
  .object({
    level: z.enum(ExecutorSupportLevel),
    capability: z.enum(ExecutorCapability),
    qualifiers: z.array(executorCapabilityQualifierSchema),
    status: z.enum(ExecutorRequirementStatus),
    evidenceKinds: z.array(evidenceKindAssessmentSchema),
  })
  .strict();

const capabilityAssessmentSchema = z
  .object({
    capability: z.enum(ExecutorCapability),
    qualifiers: z.array(executorCapabilityQualifierSchema),
    support: z.enum(ExecutorCapabilitySupport),
    requirements: z.array(requirementAssessmentSchema),
    evidenceDigests: z.array(contentDigestSchema),
  })
  .strict();

const tierAssessmentSchema = z
  .object({
    level: z.enum(ExecutorSupportLevel),
    satisfied: z.boolean(),
    missingScopeFields: z.array(z.enum(ExecutorScopeField)),
    unsatisfiedRequirementIds: z.array(requirementIdentitySchema),
  })
  .strict();

/** 可持久化 Executor Compatibility Matrix 的运行时 Schema。 */
export const executorCompatibilityMatrixSchema = z
  .object({
    schemaVersion: safeIdentifierSchema,
    profileId: safeIdentifierSchema,
    scope: executorHostScopeSchema,
    policyDigest: contentDigestSchema,
    supportLevel: z.enum(ExecutorSupportLevel),
    tiers: z.array(tierAssessmentSchema),
    capabilities: z.array(capabilityAssessmentSchema),
    evidenceDigests: z.array(contentDigestSchema),
    matrixDigest: contentDigestSchema,
  })
  .strict();
