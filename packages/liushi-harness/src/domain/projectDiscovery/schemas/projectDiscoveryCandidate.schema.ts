import { z } from "zod";

import { type ProjectProfileCandidate } from "../contracts/index.js";
import {
  ARCHITECTURE_MECHANISM_CANDIDATE_SCHEMA_VERSION,
  PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION,
} from "#common/index.js";
import { ruleDefinitionSchema } from "#domain/rule/index.js";

import {
  ProjectCandidateConfidence,
  ProjectDiscoveryStatus,
  ProjectMechanismKind,
  RepositoryRole,
} from "../enums/index.js";
import {
  projectCompilerConfigFactSchema,
  projectConfigFindingSchema,
  projectDiscoveryDiagnosticSchema,
  projectFrameworkHintSchema,
  projectInventorySummarySchema,
  projectLanguageFactSchema,
  projectPackageFactSchema,
  projectPackageManagerFactSchema,
} from "./projectDiscoveryFacts.schema.js";
import {
  discoveryContentDigestSchema,
  discoveryRepositoryIdSchema,
  discoveryTextSchema,
  hasUniqueDiscoveryIdentities,
  hasUniqueDiscoveryValues,
} from "./projectDiscoverySchemaPrimitives.js";

/** 架构机制候选 Schema。 */
export const architectureMechanismCandidateSchema = z
  .object({
    schemaVersion: z.literal(ARCHITECTURE_MECHANISM_CANDIDATE_SCHEMA_VERSION),
    candidateId: discoveryTextSchema,
    repositoryId: discoveryRepositoryIdSchema,
    kind: z.enum(ProjectMechanismKind),
    relativePath: discoveryTextSchema,
    confidence: z.enum(ProjectCandidateConfidence),
    rationale: discoveryTextSchema,
    digest: discoveryContentDigestSchema,
  })
  .strict();

/** 单个 Repository 的完整 Project Profile Candidate Schema。 */
export const projectProfileCandidateSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION),
    repositoryId: discoveryRepositoryIdSchema,
    repositoryRevision: discoveryTextSchema,
    roleHint: z.enum(RepositoryRole).optional(),
    status: z.enum(ProjectDiscoveryStatus),
    inventory: projectInventorySummarySchema,
    languages: z.array(projectLanguageFactSchema),
    packageManagers: z.array(projectPackageManagerFactSchema),
    packages: z.array(projectPackageFactSchema),
    compilerConfigs: z.array(projectCompilerConfigFactSchema),
    frameworkHints: z.array(projectFrameworkHintSchema),
    configFiles: z.array(projectConfigFindingSchema),
    mechanismCandidates: z.array(architectureMechanismCandidateSchema),
    ruleCandidates: z.array(ruleDefinitionSchema),
    diagnostics: z.array(projectDiscoveryDiagnosticSchema),
    digest: discoveryContentDigestSchema,
  })
  .strict()
  .transform((input): ProjectProfileCandidate => ({
    schemaVersion: input.schemaVersion,
    repositoryId: input.repositoryId,
    repositoryRevision: input.repositoryRevision,
    ...(input.roleHint === undefined ? {} : { roleHint: input.roleHint }),
    status: input.status,
    inventory: input.inventory,
    languages: input.languages,
    packageManagers: input.packageManagers,
    packages: input.packages,
    compilerConfigs: input.compilerConfigs,
    frameworkHints: input.frameworkHints,
    configFiles: input.configFiles,
    mechanismCandidates: input.mechanismCandidates,
    ruleCandidates: input.ruleCandidates,
    diagnostics: input.diagnostics,
    digest: input.digest,
  }))
  .superRefine((profile, context) => {
    addDuplicateIssue(
      profile.languages.map((fact) => fact.languageId),
      context,
      ["languages"],
      "Language facts must be unique.",
    );
    addDuplicateIssue(
      profile.packageManagers.map((fact) => `${fact.manager}:${fact.sourcePath}`),
      context,
      ["packageManagers"],
      "Package manager facts must be unique.",
    );
    addDuplicateIssue(
      profile.packages.map((fact) => fact.manifestPath),
      context,
      ["packages"],
      "Package facts must be unique by manifest path.",
    );
    addDuplicateIssue(
      profile.compilerConfigs.map((fact) => fact.configPath),
      context,
      ["compilerConfigs"],
      "Compiler config facts must be unique by path.",
    );
    addDuplicateIssue(
      profile.frameworkHints.map(
        (fact) =>
          `${fact.frameworkId}:${fact.packageName}:${fact.declaredRange}:${fact.sourcePath}`,
      ),
      context,
      ["frameworkHints"],
      "Framework hints must be unique.",
    );
    addDuplicateIssue(
      profile.configFiles.map((fact) => `${fact.kind}:${fact.relativePath}`),
      context,
      ["configFiles"],
      "Config findings must be unique.",
    );
    const candidateIds = profile.mechanismCandidates.map((candidate) => candidate.candidateId);
    if (!hasUniqueDiscoveryValues(candidateIds)) {
      context.addIssue({
        code: "custom",
        message: "Mechanism candidate IDs must be unique.",
        path: ["mechanismCandidates"],
      });
    }

    const ruleIds = profile.ruleCandidates.map((rule) => `${rule.ruleId}@${rule.version}`);
    if (!hasUniqueDiscoveryIdentities(ruleIds)) {
      context.addIssue({
        code: "custom",
        message: "Rule candidate IDs must be unique.",
        path: ["ruleCandidates"],
      });
    }
    addDuplicateIssue(
      profile.diagnostics.map(
        (item) =>
          `${item.repositoryId}:${item.code}:${item.severity}:${item.relativePath ?? ""}:${item.message}`,
      ),
      context,
      ["diagnostics"],
      "Discovery diagnostics must be unique.",
    );
  });

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
