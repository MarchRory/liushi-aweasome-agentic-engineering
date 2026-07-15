import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type Result,
} from "#common/index.js";
import { parseRepositoryId } from "#domain/workspace/index.js";

import { MANAGED_FILE_MANIFEST_SCHEMA_VERSION } from "../constants/index.js";
import type { ManagedFileOriginalState, ManagedManifestSnapshot } from "../contracts/index.js";
import {
  ManagedFileActualKind,
  ManagedManifestState,
  ManagedOwnershipProvenance,
} from "../enums/index.js";
import { parseInstallationRevisionId } from "../identifiers/index.js";

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
const entrySchema = z
  .object({
    path: z.string().refine(isValidManagedFilePath),
    lastAppliedDigest: digestSchema,
    repositoryId: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/u),
    installationRevisionId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u),
    installPlanDigest: digestSchema,
    original: z
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
      }),
    metadata: metadataSchema,
  })
  .strict();
const manifestSchema = z
  .object({
    schemaVersion: z.literal(MANAGED_FILE_MANIFEST_SCHEMA_VERSION),
    entries: z.array(entrySchema),
  })
  .strict();

/** 严格校验仓库 managed-files.json，重复路径和未知字段均失败关闭。 */
export function parseManagedManifest(
  input: unknown,
): Result<ManagedManifestSnapshot, HarnessError> {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success)
    return failure(
      new HarnessError(HarnessErrorCode.CorruptStore, "Managed file manifest schema is invalid."),
    );
  const paths = new Set<string>();
  for (const entry of parsed.data.entries) {
    if (paths.has(entry.path))
      return failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "Managed file manifest contains duplicate paths.",
          { path: entry.path },
        ),
      );
    paths.add(entry.path);
  }
  const entries = [];
  for (const entry of parsed.data.entries) {
    const digest = parseContentDigest(entry.lastAppliedDigest);
    if (digest.status === ResultStatus.Failure) return invalidManifest();
    const sourceDigest = parseContentDigest(entry.metadata.sourceDigest);
    if (sourceDigest.status === ResultStatus.Failure) return invalidManifest();
    const planDigest = parseContentDigest(entry.installPlanDigest);
    if (planDigest.status === ResultStatus.Failure) return invalidManifest();
    const repositoryId = parseRepositoryId(entry.repositoryId);
    if (repositoryId.status === ResultStatus.Failure) return invalidManifest();
    const installationRevisionId = parseInstallationRevisionId(entry.installationRevisionId);
    if (installationRevisionId.status === ResultStatus.Failure) return invalidManifest();
    const originalDigest =
      entry.original.digest === undefined ? undefined : parseContentDigest(entry.original.digest);
    if (originalDigest?.status === ResultStatus.Failure) return invalidManifest();
    const original: ManagedFileOriginalState =
      originalDigest === undefined
        ? { kind: ManagedFileActualKind.Missing }
        : { kind: ManagedFileActualKind.RegularFile, digest: originalDigest.value };
    entries.push({
      ...entry,
      lastAppliedDigest: digest.value,
      repositoryId: repositoryId.value,
      installationRevisionId: installationRevisionId.value,
      installPlanDigest: planDigest.value,
      original,
      provenance: ManagedOwnershipProvenance.UnverifiedClaim,
      metadata: { ...entry.metadata, sourceDigest: sourceDigest.value },
    });
  }
  return success({ state: ManagedManifestState.Present, entries });
}

function invalidManifest(): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.CorruptStore, "Managed file manifest value is invalid."),
  );
}

/** 判断字符串是否为不含穿越片段的受限 Repository 相对路径。 */
export function isValidManagedFilePath(value: string): boolean {
  if (value.length === 0 || value.includes("\\") || value.startsWith("/")) return false;
  const segments = value.split("/");
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      segment !== "." &&
      segment !== ".." &&
      /^[A-Za-z0-9._-]+$/u.test(segment),
  );
}

/** 以 UTF-16 code unit 顺序比较路径，避免 Locale 改变计划摘要。 */
export function compareManagedFilePath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** 创建不含条目的空 manifest 读取结果。 */
export function createMissingManagedManifest(): ManagedManifestSnapshot {
  return { state: ManagedManifestState.Missing, entries: [] };
}
