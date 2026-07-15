import { z } from "zod";

import {
  INSTALLATION_REVISION_SCHEMA_VERSION,
  InstallationRevisionEventType,
  ManagedFileActualKind,
  ManagedFileGateId,
  ManagedOwnershipProvenance,
  isValidManagedFilePath,
} from "#domain/installation/index.js";

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const revisionIdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u);
const repositoryIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/u);
const managedPathSchema = z.string().refine(isValidManagedFilePath);
const metadataSchema = z
  .object({
    ownerPackage: z.string().min(1),
    profile: z.string().min(1),
    packageVersion: z.string().min(1),
    template: z.string().min(1),
    source: z.string().min(1),
    sourceDigest: digestSchema,
  })
  .strict();
const originalSchema = z
  .object({
    kind: z.enum([ManagedFileActualKind.Missing, ManagedFileActualKind.RegularFile]),
    digest: digestSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const requiresDigest = value.kind === ManagedFileActualKind.RegularFile;
    if (requiresDigest !== (value.digest !== undefined))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Original state digest does not match its file kind.",
      });
  });

/** Manifest 条目使用的严格 ownership 字段 Schema。 */
export const persistedEntrySchema = z
  .object({
    path: managedPathSchema,
    lastAppliedDigest: digestSchema,
    repositoryId: repositoryIdSchema,
    installationRevisionId: revisionIdSchema,
    installPlanDigest: digestSchema,
    original: originalSchema,
    provenance: z.nativeEnum(ManagedOwnershipProvenance),
    metadata: metadataSchema,
  })
  .strict();

const missingPreimageSchema = z
  .object({
    path: managedPathSchema,
    kind: z.literal(ManagedFileActualKind.Missing),
  })
  .strict();
const regularPreimageSchema = z
  .object({
    path: managedPathSchema,
    kind: z.literal(ManagedFileActualKind.RegularFile),
    digest: digestSchema,
    content: z.string(),
  })
  .strict();
const preimageSchema = z.discriminatedUnion("kind", [missingPreimageSchema, regularPreimageSchema]);
const approvalSchema = z
  .object({
    gate: z.literal(ManagedFileGateId.G0ManagedFiles),
    actorId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    approvedAt: z.string().datetime(),
    planId: revisionIdSchema,
    planDigest: digestSchema,
  })
  .strict();
const manifestProjectionSchema = z
  .object({
    content: z.string(),
    digest: digestSchema,
    entries: z.array(persistedEntrySchema),
  })
  .strict();

/** Installation Revision Intent 的严格结构 Schema。 */
export const intentSchema = z
  .object({
    revisionId: revisionIdSchema,
    plan: z.unknown(),
    approval: approvalSchema,
    preimages: z.array(preimageSchema),
    manifestAfter: manifestProjectionSchema,
    createdDirectories: z.array(managedPathSchema),
  })
  .strict();

const fileAppliedEventSchema = z
  .object({
    type: z.literal(InstallationRevisionEventType.FileApplied),
    path: managedPathSchema,
    recordedAt: z.string().datetime(),
  })
  .strict();
const manifestAppliedEventSchema = z
  .object({
    type: z.literal(InstallationRevisionEventType.ManifestApplied),
    recordedAt: z.string().datetime(),
  })
  .strict();
const postconditionsVerifiedEventSchema = z
  .object({
    type: z.literal(InstallationRevisionEventType.PostconditionsVerified),
    recordedAt: z.string().datetime(),
  })
  .strict();
const committedEventSchema = z
  .object({
    type: z.literal(InstallationRevisionEventType.Committed),
    recordedAt: z.string().datetime(),
  })
  .strict();

/** Installation Revision 允许追加事件的封闭 Schema。 */
export const eventSchema = z.discriminatedUnion("type", [
  fileAppliedEventSchema,
  manifestAppliedEventSchema,
  postconditionsVerifiedEventSchema,
  committedEventSchema,
]);

/** Installation Revision 持久化记录的严格外层 Schema。 */
export const recordSchema = z
  .object({
    schemaVersion: z.literal(INSTALLATION_REVISION_SCHEMA_VERSION),
    revisionId: revisionIdSchema,
    intent: z.unknown(),
    events: z.array(eventSchema),
    recordDigest: digestSchema,
  })
  .strict();
