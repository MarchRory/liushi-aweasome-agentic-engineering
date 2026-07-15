import { isAbsolute } from "node:path";
import { z } from "zod";

import type { ContentDigestPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  FileInstallAction,
  InstallationTarget,
  ManagedFileActualKind,
  ManagedFileGateId,
  ManagedManifestState,
  ManagedOwnershipProvenance,
  INSTALL_PLAN_SCHEMA_VERSION,
  calculateInstallPlanDigest,
  compareManagedFilePath,
  isValidManagedFilePath,
  parseManagedManifest,
  planManagedFile,
  type InstallPlan,
} from "#domain/installation/index.js";
import { normalizePathIdentity } from "#infrastructure/system/platformCompatibility/index.js";

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
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
const managedPathSchema = z.string().refine(isValidManagedFilePath);
const desiredSchema = z
  .object({
    path: managedPathSchema,
    content: z.string(),
    digest: digestSchema,
    metadata: metadataSchema,
  })
  .strict();
const actualSchema = z
  .object({
    path: managedPathSchema,
    kind: z.nativeEnum(ManagedFileActualKind),
    digest: digestSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    addDigestKindIssue(
      value.kind === ManagedFileActualKind.RegularFile,
      value.digest,
      context,
      "Actual state digest does not match its file kind.",
    );
  });
const originalSchema = z
  .object({
    kind: z.enum([ManagedFileActualKind.Missing, ManagedFileActualKind.RegularFile]),
    digest: digestSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    addDigestKindIssue(
      value.kind === ManagedFileActualKind.RegularFile,
      value.digest,
      context,
      "Original state digest does not match its file kind.",
    );
  });
const persistedSchema = z
  .object({
    path: managedPathSchema,
    lastAppliedDigest: digestSchema,
    repositoryId: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/u),
    installationRevisionId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u),
    installPlanDigest: digestSchema,
    original: originalSchema,
    provenance: z.literal(ManagedOwnershipProvenance.UnverifiedClaim),
    metadata: metadataSchema,
  })
  .strict();
const missingManifestSchema = z
  .object({
    state: z.literal(ManagedManifestState.Missing),
    entries: z.array(z.never()).length(0),
  })
  .strict();
const presentManifestSchema = z
  .object({
    state: z.literal(ManagedManifestState.Present),
    entries: z.array(persistedSchema),
    content: z.string(),
    digest: digestSchema,
  })
  .strict();
const fileSchema = z
  .object({
    path: managedPathSchema,
    action: z.nativeEnum(FileInstallAction),
    desired: desiredSchema,
    actual: actualSchema,
    persisted: persistedSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.path !== value.desired.path ||
      value.path !== value.actual.path ||
      (value.persisted !== undefined && value.path !== value.persisted.path)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "InstallPlan file states do not reference the same path.",
      });
  });
const planSchema = z
  .object({
    schemaVersion: z.literal(INSTALL_PLAN_SCHEMA_VERSION),
    planId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u),
    planDigest: digestSchema,
    workspaceId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/u),
    repositoryId: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/u),
    root: z.string().min(1).refine(isAbsolute),
    target: z.nativeEnum(InstallationTarget),
    createdAt: z.string().datetime(),
    createdBy: z.string().min(1),
    requiredGate: z.literal(ManagedFileGateId.G0ManagedFiles),
    manifest: z.discriminatedUnion("state", [missingManifestSchema, presentManifestSchema]),
    files: z.array(fileSchema).min(1),
  })
  .strict();

/** 严格验证 InstallPlan Schema、文件语义、内容摘要和顶层摘要。 */
export function verifyInstallPlanIntegrity(
  input: unknown,
  digest: ContentDigestPort,
  platform: NodeJS.Platform = process.platform,
): Result<InstallPlan, HarnessErrorType> {
  const parsed = parsePlan(input, platform);
  if (parsed.status === ResultStatus.Failure) return parsed;
  const manifest = verifyManifestSnapshot(parsed.value, digest);
  if (manifest.status === ResultStatus.Failure) return manifest;
  for (const entry of parsed.value.files) {
    const desiredDigest = digest.calculate(entry.desired.content);
    if (
      desiredDigest.status === ResultStatus.Failure ||
      desiredDigest.value !== entry.desired.digest
    )
      return corruptPlan("Managed file content digest is invalid.", entry.path);
    const planned = planManagedFile(entry.desired, entry.actual, entry.persisted);
    if (planned.status === ResultStatus.Failure || planned.value.action !== entry.action)
      return corruptPlan("Managed file action is invalid.", entry.path);
  }
  const planDigest = calculateInstallPlanDigest(
    (value) => digest.calculate(value),
    omitDigest(parsed.value),
  );
  return planDigest.status === ResultStatus.Failure || planDigest.value !== parsed.value.planDigest
    ? corruptPlan("InstallPlan digest is invalid.")
    : parsed;
}

function parsePlan(
  input: unknown,
  platform: NodeJS.Platform,
): Result<InstallPlan, HarnessErrorType> {
  const value = planSchema.safeParse(input);
  if (!value.success) return corruptPlan("InstallPlan schema is invalid.");
  const sorted = [...value.data.files].map((entry) => entry.path).sort(compareManagedFilePath);
  const pathIdentities = sorted.map((path) => normalizePathIdentity(path, platform));
  if (
    sorted.some((path, index) => path !== value.data.files[index]?.path) ||
    new Set(sorted).size !== sorted.length ||
    new Set(pathIdentities).size !== pathIdentities.length
  )
    return corruptPlan("InstallPlan file path identities are not unique and sorted.");
  return success(value.data as unknown as InstallPlan);
}

function omitDigest(plan: InstallPlan): Omit<InstallPlan, "planDigest"> {
  return {
    schemaVersion: plan.schemaVersion,
    planId: plan.planId,
    workspaceId: plan.workspaceId,
    repositoryId: plan.repositoryId,
    root: plan.root,
    target: plan.target,
    createdAt: plan.createdAt,
    createdBy: plan.createdBy,
    requiredGate: plan.requiredGate,
    manifest: plan.manifest,
    files: plan.files,
  };
}

function verifyManifestSnapshot(
  plan: InstallPlan,
  digest: ContentDigestPort,
): Result<void, HarnessErrorType> {
  if (plan.manifest.state === ManagedManifestState.Missing) return success(undefined);
  const calculated = digest.calculate(plan.manifest.content);
  if (calculated.status === ResultStatus.Failure || calculated.value !== plan.manifest.digest)
    return corruptPlan("Managed manifest content digest is invalid.");
  let raw: unknown;
  try {
    raw = JSON.parse(plan.manifest.content) as unknown;
  } catch {
    return corruptPlan("Managed manifest content is invalid JSON.");
  }
  const parsed = parseManagedManifest(raw);
  if (
    parsed.status === ResultStatus.Failure ||
    JSON.stringify(parsed.value.entries) !== JSON.stringify(plan.manifest.entries)
  )
    return corruptPlan("Managed manifest entries do not match its bound content.");
  return success(undefined);
}

function addDigestKindIssue(
  requiresDigest: boolean,
  digest: string | undefined,
  context: z.RefinementCtx,
  message: string,
): void {
  if (requiresDigest !== (digest !== undefined))
    context.addIssue({ code: z.ZodIssueCode.custom, message });
}

function corruptPlan(message: string, path?: string): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.CorruptStore, message, path === undefined ? {} : { path }),
  );
}
