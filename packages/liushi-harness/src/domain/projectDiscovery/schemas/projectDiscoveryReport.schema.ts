import { z } from "zod";

import {
  PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";

import { PROJECT_SCANNER_VERSION } from "../constants/index.js";
import type { ProjectDiscoveryReport } from "../contracts/index.js";
import {
  ProjectDependencyKind,
  ProjectDiscoveryStatus,
  ProjectProfilePromotionStatus,
} from "../enums/index.js";
import { projectProfileCandidateSchema } from "./projectDiscoveryCandidate.schema.js";
import { createProjectDiscoverySchemaError } from "./projectDiscoverySchemaError.js";
import {
  discoveryContentDigestSchema,
  discoveryRepositoryIdSchema,
  discoveryTextSchema,
  discoveryWorkspaceIdSchema,
  hasUniqueDiscoveryValues,
  hasUniqueDiscoveryIdentities,
} from "./projectDiscoverySchemaPrimitives.js";

/** 跨 Repository 依赖边候选 Schema。 */
export const projectDependencyEdgeCandidateSchema = z
  .object({
    fromRepositoryId: discoveryRepositoryIdSchema,
    toRepositoryId: discoveryRepositoryIdSchema,
    kind: z.enum(ProjectDependencyKind),
    packageName: discoveryTextSchema,
    sourcePath: discoveryTextSchema,
  })
  .strict();

/** 多 Owner 依赖歧义候选 Schema。 */
export const projectDependencyAmbiguityCandidateSchema = z
  .object({
    fromRepositoryId: discoveryRepositoryIdSchema,
    kind: z.enum(ProjectDependencyKind),
    packageName: discoveryTextSchema,
    sourcePath: discoveryTextSchema,
    owners: z.array(discoveryRepositoryIdSchema),
  })
  .strict()
  .superRefine((ambiguity, context) => {
    if (!hasUniqueDiscoveryValues(ambiguity.owners)) {
      context.addIssue({
        code: "custom",
        message: "Dependency ambiguity owners must be unique.",
        path: ["owners"],
      });
    }
  });

/** 完整且拒绝未知字段的 Project Discovery Report Schema。 */
export const projectDiscoveryReportSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION),
    scannerVersion: z.literal(PROJECT_SCANNER_VERSION),
    workspaceId: discoveryWorkspaceIdSchema,
    workspaceGraphRevision: discoveryTextSchema,
    status: z.enum(ProjectDiscoveryStatus),
    profilePromotionStatus: z.enum(ProjectProfilePromotionStatus),
    profileCandidates: z.array(projectProfileCandidateSchema),
    dependencyEdges: z.array(projectDependencyEdgeCandidateSchema),
    dependencyAmbiguities: z.array(projectDependencyAmbiguityCandidateSchema),
    digest: discoveryContentDigestSchema,
  })
  .strict()
  .superRefine((report, context) => {
    const repositoryIds = report.profileCandidates.map((profile) => profile.repositoryId);
    if (!hasUniqueDiscoveryValues(repositoryIds)) {
      context.addIssue({
        code: "custom",
        message: "Profile repository IDs must be unique.",
        path: ["profileCandidates"],
      });
    }
    addDuplicateIssue(
      report.dependencyEdges.map(
        (edge) =>
          `${edge.fromRepositoryId}:${edge.toRepositoryId}:${edge.kind}:${edge.packageName}:${edge.sourcePath}`,
      ),
      context,
      ["dependencyEdges"],
      "Dependency edges must be unique.",
    );
    addDuplicateIssue(
      report.dependencyAmbiguities.map(
        (item) => `${item.fromRepositoryId}:${item.kind}:${item.packageName}:${item.sourcePath}`,
      ),
      context,
      ["dependencyAmbiguities"],
      "Dependency ambiguities must be unique.",
    );
  });

/** 严格解析未知输入并返回 branded Project Discovery Report。 */
export function parseProjectDiscoveryReport(
  input: unknown,
): Result<ProjectDiscoveryReport, HarnessError> {
  const parsed = projectDiscoveryReportSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data)
    : failure(
        createProjectDiscoverySchemaError(parsed.error, "Project discovery report is invalid."),
      );
}

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
