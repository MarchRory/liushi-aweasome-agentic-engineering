import { z } from "zod";

import {
  PROJECT_SCAN_MANIFEST_SCHEMA_VERSION,
  ResultStatus,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";
import {
  parseRepositoryId,
  parseWorkspaceId,
  type RepositoryId,
  type WorkspaceId,
} from "#domain/workspace/index.js";

import {
  DEFAULT_SCAN_MAX_CONFIG_FILE_BYTES,
  DEFAULT_SCAN_MAX_CONFIG_FILES,
  DEFAULT_SCAN_MAX_DEPTH,
  DEFAULT_SCAN_MAX_DIAGNOSTICS,
  DEFAULT_SCAN_MAX_DIRECTORIES,
  DEFAULT_SCAN_MAX_FILES,
  DEFAULT_SCAN_MAX_TOTAL_CONFIG_BYTES,
  HARD_SCAN_MAX_CONFIG_FILE_BYTES,
  HARD_SCAN_MAX_CONFIG_FILES,
  HARD_SCAN_MAX_DEPTH,
  HARD_SCAN_MAX_DIAGNOSTICS,
  HARD_SCAN_MAX_DIRECTORIES,
  HARD_SCAN_MAX_FILES,
  HARD_SCAN_MAX_REPOSITORIES,
  HARD_SCAN_MAX_TOTAL_CONFIG_BYTES,
  MAX_DISCOVERY_TEXT_LENGTH,
  MAX_SCAN_ROOT_LENGTH,
} from "../constants/index.js";
import type {
  ProjectScanBudget,
  ProjectScanManifest,
  ProjectScanRepository,
} from "../contracts/index.js";
import { RepositoryRole } from "../enums/index.js";
import { createProjectDiscoverySchemaError } from "./projectDiscoverySchemaError.js";

const nonBlank = (maxLength: number): z.ZodString =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim());

const workspaceIdSchema = z.string().transform((value, context): WorkspaceId => {
  const parsed = parseWorkspaceId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const repositoryIdSchema = z.string().transform((value, context): RepositoryId => {
  const parsed = parseRepositoryId(value);
  if (parsed.status === ResultStatus.Failure) {
    context.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.value;
});

const scanBudgetSchema = z
  .object({
    maxFilesPerRepository: z.number().int().positive().max(HARD_SCAN_MAX_FILES).optional(),
    maxDirectoriesPerRepository: z
      .number()
      .int()
      .positive()
      .max(HARD_SCAN_MAX_DIRECTORIES)
      .optional(),
    maxDepth: z.number().int().positive().max(HARD_SCAN_MAX_DEPTH).optional(),
    maxConfigFilesPerRepository: z
      .number()
      .int()
      .positive()
      .max(HARD_SCAN_MAX_CONFIG_FILES)
      .optional(),
    maxConfigFileBytes: z.number().int().positive().max(HARD_SCAN_MAX_CONFIG_FILE_BYTES).optional(),
    maxTotalConfigBytesPerRepository: z
      .number()
      .int()
      .positive()
      .max(HARD_SCAN_MAX_TOTAL_CONFIG_BYTES)
      .optional(),
    maxDiagnosticsPerRepository: z
      .number()
      .int()
      .positive()
      .max(HARD_SCAN_MAX_DIAGNOSTICS)
      .optional(),
  })
  .strict()
  .transform((input): ProjectScanBudget => ({
    maxFilesPerRepository: input.maxFilesPerRepository ?? DEFAULT_SCAN_MAX_FILES,
    maxDirectoriesPerRepository: input.maxDirectoriesPerRepository ?? DEFAULT_SCAN_MAX_DIRECTORIES,
    maxDepth: input.maxDepth ?? DEFAULT_SCAN_MAX_DEPTH,
    maxConfigFilesPerRepository: input.maxConfigFilesPerRepository ?? DEFAULT_SCAN_MAX_CONFIG_FILES,
    maxConfigFileBytes: input.maxConfigFileBytes ?? DEFAULT_SCAN_MAX_CONFIG_FILE_BYTES,
    maxTotalConfigBytesPerRepository:
      input.maxTotalConfigBytesPerRepository ?? DEFAULT_SCAN_MAX_TOTAL_CONFIG_BYTES,
    maxDiagnosticsPerRepository: input.maxDiagnosticsPerRepository ?? DEFAULT_SCAN_MAX_DIAGNOSTICS,
  }))
  .refine((budget) => budget.maxTotalConfigBytesPerRepository >= budget.maxConfigFileBytes, {
    message: "Total config byte budget cannot be smaller than the per-file budget.",
    path: ["maxTotalConfigBytesPerRepository"],
  });

const scanRepositorySchema = z
  .object({
    repositoryId: repositoryIdSchema,
    localRoot: nonBlank(MAX_SCAN_ROOT_LENGTH).refine((value) => !value.includes("\0")),
    repositoryRevision: nonBlank(MAX_DISCOVERY_TEXT_LENGTH),
    roleHint: z.enum(RepositoryRole).optional(),
  })
  .strict()
  .transform((input): ProjectScanRepository => ({
    repositoryId: input.repositoryId,
    localRoot: input.localRoot,
    repositoryRevision: input.repositoryRevision,
    ...(input.roleHint === undefined ? {} : { roleHint: input.roleHint }),
  }));

const rawProjectScanManifestSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_SCAN_MANIFEST_SCHEMA_VERSION),
    workspaceId: workspaceIdSchema,
    workspaceGraphRevision: nonBlank(MAX_DISCOVERY_TEXT_LENGTH),
    repositories: z.array(scanRepositorySchema).min(1).max(HARD_SCAN_MAX_REPOSITORIES),
    budget: scanBudgetSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const normalizedIds = input.repositories.map((repository) =>
      repository.repositoryId.toLowerCase(),
    );
    if (new Set(normalizedIds).size !== normalizedIds.length) {
      context.addIssue({
        code: "custom",
        message: "Repository IDs must be unique ignoring case.",
        path: ["repositories"],
      });
    }
  });

/** Project Scan Manifest 的严格 Schema。 */
export const projectScanManifestSchema = rawProjectScanManifestSchema.transform(
  (input): ProjectScanManifest => ({
    schemaVersion: input.schemaVersion,
    workspaceId: input.workspaceId,
    workspaceGraphRevision: input.workspaceGraphRevision,
    repositories: input.repositories,
    budget:
      input.budget ??
      ({
        maxFilesPerRepository: DEFAULT_SCAN_MAX_FILES,
        maxDirectoriesPerRepository: DEFAULT_SCAN_MAX_DIRECTORIES,
        maxDepth: DEFAULT_SCAN_MAX_DEPTH,
        maxConfigFilesPerRepository: DEFAULT_SCAN_MAX_CONFIG_FILES,
        maxConfigFileBytes: DEFAULT_SCAN_MAX_CONFIG_FILE_BYTES,
        maxTotalConfigBytesPerRepository: DEFAULT_SCAN_MAX_TOTAL_CONFIG_BYTES,
        maxDiagnosticsPerRepository: DEFAULT_SCAN_MAX_DIAGNOSTICS,
      } satisfies ProjectScanBudget),
  }),
);

/** 校验未知输入并返回规范 Project Scan Manifest。 */
export function parseProjectScanManifest(
  input: unknown,
): Result<ProjectScanManifest, HarnessError> {
  const parsed = projectScanManifestSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data)
    : failure(createProjectDiscoverySchemaError(parsed.error, "Project scan manifest is invalid."));
}
