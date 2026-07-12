import { z } from "zod";

import {
  type ProjectCompilerConfigFact,
  type ProjectConfigFinding,
  type ProjectDiscoveryDiagnostic,
  type ProjectPackageFact,
} from "../contracts/index.js";
import {
  ProjectConfigKind,
  ProjectConfigParseStatus,
  ProjectDependencyKind,
  ProjectDiagnosticCode,
  ProjectDiagnosticSeverity,
  ProjectPackageManager,
} from "../enums/index.js";
import {
  discoveryContentDigestSchema,
  discoveryCountSchema,
  discoveryRepositoryIdSchema,
  discoveryTextSchema,
  hasUniqueDiscoveryIdentities,
} from "./projectDiscoverySchemaPrimitives.js";

/** Repository 文件树统计 Schema。 */
export const projectInventorySummarySchema = z
  .object({
    fileCount: discoveryCountSchema,
    directoryCount: discoveryCountSchema,
    skippedLinkCount: discoveryCountSchema,
    ignoredDirectoryCount: discoveryCountSchema,
  })
  .strict();

/** 确定性语言统计 Schema。 */
export const projectLanguageFactSchema = z
  .object({
    languageId: discoveryTextSchema,
    fileCount: discoveryCountSchema,
  })
  .strict();

/** 配置文件处理结果 Schema。 */
export const projectConfigFindingSchema = z
  .object({
    kind: z.enum(ProjectConfigKind),
    relativePath: discoveryTextSchema,
    contentDigest: discoveryContentDigestSchema.optional(),
    parseStatus: z.enum(ProjectConfigParseStatus),
  })
  .strict()
  .transform((input): ProjectConfigFinding => ({
    kind: input.kind,
    relativePath: input.relativePath,
    ...(input.contentDigest === undefined ? {} : { contentDigest: input.contentDigest }),
    parseStatus: input.parseStatus,
  }));

/** Package Manager 事实 Schema。 */
export const projectPackageManagerFactSchema = z
  .object({
    manager: z.enum(ProjectPackageManager),
    sourcePath: discoveryTextSchema,
  })
  .strict();

/** Package Manifest 依赖事实 Schema。 */
export const projectDependencyFactSchema = z
  .object({
    packageName: discoveryTextSchema,
    declaredRange: discoveryTextSchema,
    kind: z.enum(ProjectDependencyKind),
    manifestPath: discoveryTextSchema,
  })
  .strict();

/** Package Manifest 摘要 Schema。 */
export const projectPackageFactSchema = z
  .object({
    manifestPath: discoveryTextSchema,
    packageName: discoveryTextSchema.optional(),
    scriptNames: z.array(discoveryTextSchema),
    workspacePatterns: z.array(discoveryTextSchema),
    dependencies: z.array(projectDependencyFactSchema),
  })
  .strict()
  .superRefine((input, context) => {
    addDuplicateIssue(input.scriptNames, context, ["scriptNames"], "Script names must be unique.");
    addDuplicateIssue(
      input.workspacePatterns,
      context,
      ["workspacePatterns"],
      "Workspace patterns must be unique.",
    );
    addDuplicateIssue(
      input.dependencies.map(
        (item) => `${item.packageName}:${item.kind}:${item.declaredRange}:${item.manifestPath}`,
      ),
      context,
      ["dependencies"],
      "Dependency facts must be unique.",
    );
  })
  .transform((input): ProjectPackageFact => ({
    manifestPath: input.manifestPath,
    ...(input.packageName === undefined ? {} : { packageName: input.packageName }),
    scriptNames: input.scriptNames,
    workspacePatterns: input.workspacePatterns,
    dependencies: input.dependencies,
  }));

/** Compiler 配置事实 Schema。 */
export const projectCompilerConfigFactSchema = z
  .object({
    configPath: discoveryTextSchema,
    strict: z.boolean().optional(),
    forceConsistentCasingInFileNames: z.boolean().optional(),
    noUncheckedIndexedAccess: z.boolean().optional(),
    exactOptionalPropertyTypes: z.boolean().optional(),
    pathAliasKeys: z.array(discoveryTextSchema),
    extendsRef: discoveryTextSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    addDuplicateIssue(
      input.pathAliasKeys,
      context,
      ["pathAliasKeys"],
      "Compiler path aliases must be unique.",
    );
  })
  .transform((input): ProjectCompilerConfigFact => ({
    configPath: input.configPath,
    ...(input.strict === undefined ? {} : { strict: input.strict }),
    ...(input.forceConsistentCasingInFileNames === undefined
      ? {}
      : { forceConsistentCasingInFileNames: input.forceConsistentCasingInFileNames }),
    ...(input.noUncheckedIndexedAccess === undefined
      ? {}
      : { noUncheckedIndexedAccess: input.noUncheckedIndexedAccess }),
    ...(input.exactOptionalPropertyTypes === undefined
      ? {}
      : { exactOptionalPropertyTypes: input.exactOptionalPropertyTypes }),
    pathAliasKeys: input.pathAliasKeys,
    ...(input.extendsRef === undefined ? {} : { extendsRef: input.extendsRef }),
  }));

/** Framework 与工具提示 Schema。 */
export const projectFrameworkHintSchema = z
  .object({
    frameworkId: discoveryTextSchema,
    packageName: discoveryTextSchema,
    declaredRange: discoveryTextSchema,
    sourcePath: discoveryTextSchema,
  })
  .strict();

/** Project Scanner 诊断 Schema。 */
export const projectDiscoveryDiagnosticSchema = z
  .object({
    code: z.enum(ProjectDiagnosticCode),
    severity: z.enum(ProjectDiagnosticSeverity),
    repositoryId: discoveryRepositoryIdSchema,
    relativePath: discoveryTextSchema.optional(),
    message: discoveryTextSchema,
  })
  .strict()
  .transform((input): ProjectDiscoveryDiagnostic => ({
    code: input.code,
    severity: input.severity,
    repositoryId: input.repositoryId,
    ...(input.relativePath === undefined ? {} : { relativePath: input.relativePath }),
    message: input.message,
  }));

function addDuplicateIssue(
  identities: readonly string[],
  context: z.RefinementCtx,
  path: PropertyKey[],
  message: string,
): void {
  if (!hasUniqueDiscoveryIdentities(identities)) {
    context.addIssue({ code: "custom", message, path });
  }
}
