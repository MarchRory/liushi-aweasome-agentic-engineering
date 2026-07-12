import { describe, expect, it } from "vitest";

import {
  ARCHITECTURE_MECHANISM_CANDIDATE_SCHEMA_VERSION,
  PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION,
  PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION,
  ResultStatus,
} from "../../src/common/index.js";
import {
  PROJECT_SCANNER_VERSION,
  ProjectCandidateConfidence,
  ProjectConfigKind,
  ProjectConfigParseStatus,
  ProjectDependencyKind,
  ProjectDiagnosticCode,
  ProjectDiagnosticSeverity,
  ProjectDiscoveryStatus,
  ProjectMechanismKind,
  ProjectPackageManager,
  ProjectProfilePromotionStatus,
  RepositoryRole,
  createProjectProfileCandidateDigestInput,
  parseProjectDiscoveryReport,
} from "../../src/domain/projectDiscovery/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";
import { createRule } from "../support/rule/index.js";

const DIGEST = `sha256:${"a".repeat(64)}`;

/** 用于构造重复事实的 Project Profile Candidate 集合字段。 */
enum CandidateCollectionField {
  /** 语言统计集合。 */
  Languages = "languages",
  /** Compiler 配置集合。 */
  CompilerConfigs = "compilerConfigs",
  /** 配置发现集合。 */
  ConfigFiles = "configFiles",
}

describe("Project discovery report schema", () => {
  it("parses a strict multi-repository report with every fact category", () => {
    const input = report();
    const result = parseProjectDiscoveryReport(input);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value).toEqual(input);
      expect(result.value.profileCandidates).toHaveLength(2);
      expect(result.value.dependencyEdges).toHaveLength(1);
      expect(result.value.dependencyAmbiguities).toHaveLength(1);
    }
  });

  it.each([
    ["top-level unknown field", () => ({ ...report(), unknown: true })],
    [
      "nested unknown localRoot",
      () => {
        const input = report();
        return {
          ...input,
          profileCandidates: [{ ...input.profileCandidates[0], localRoot: "C:/secret" }],
        };
      },
    ],
    ["illegal enum", () => ({ ...report(), status: "partial" })],
  ])("rejects %s", (_name, createInput) => {
    expect(parseProjectDiscoveryReport(createInput()).status).toBe(ResultStatus.Failure);
  });

  it("rejects an invalid digest", () => {
    const result = parseProjectDiscoveryReport({ ...report(), digest: "sha256:not-a-digest" });

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it.each([
    [
      "repository IDs",
      () => ({
        ...report(),
        profileCandidates: [profile("repo-a"), profile("REPO-A")],
      }),
    ],
    [
      "mechanism candidate IDs",
      () => {
        const input = report();
        const candidate = input.profileCandidates[0]!.mechanismCandidates[0]!;
        return {
          ...input,
          profileCandidates: [
            {
              ...input.profileCandidates[0]!,
              mechanismCandidates: [
                candidate,
                { ...candidate, candidateId: candidate.candidateId.toUpperCase() },
              ],
            },
          ],
        };
      },
    ],
    ["languages", () => duplicateCandidateCollection(CandidateCollectionField.Languages)],
    [
      "compiler configs",
      () => duplicateCandidateCollection(CandidateCollectionField.CompilerConfigs),
    ],
    ["config findings", () => duplicateCandidateCollection(CandidateCollectionField.ConfigFiles)],
    [
      "rule IDs",
      () => {
        const input = report();
        const rule = input.profileCandidates[0]!.ruleCandidates[0]!;
        return {
          ...input,
          profileCandidates: [
            { ...input.profileCandidates[0]!, ruleCandidates: [rule, { ...rule }] },
          ],
        };
      },
    ],
    [
      "ambiguity owners",
      () => {
        const input = report();
        return {
          ...input,
          dependencyAmbiguities: [
            { ...input.dependencyAmbiguities[0], owners: ["repo-a", "REPO-A"] },
          ],
        };
      },
    ],
  ])("rejects duplicate %s", (_name, createInput) => {
    expect(parseProjectDiscoveryReport(createInput()).status).toBe(ResultStatus.Failure);
  });

  it("parses arrays beyond the former threshold", () => {
    const input = report();
    const languages = Array.from({ length: 1_001 }, (_, index) => ({
      languageId: `language-${index}`,
      fileCount: index,
    }));
    const result = parseProjectDiscoveryReport({
      ...input,
      profileCandidates: [{ ...input.profileCandidates[0]!, languages }],
    });

    expect(result.status).toBe(ResultStatus.Success);
  });

  it("keeps candidate digest stable across business collection permutations", () => {
    const parsed = parseProjectDiscoveryReport(report());
    expect(parsed.status).toBe(ResultStatus.Success);
    if (parsed.status !== ResultStatus.Success) return;
    const candidate = parsed.value.profileCandidates[0]!;
    const extended = {
      ...candidate,
      languages: [...candidate.languages, { languageId: "javascript", fileCount: 2 }],
      compilerConfigs: [
        ...candidate.compilerConfigs,
        {
          ...candidate.compilerConfigs[0]!,
          configPath: "tsconfig.build.json",
        },
      ],
      configFiles: [
        ...candidate.configFiles,
        {
          ...candidate.configFiles[0]!,
          relativePath: "eslint.config.js",
        },
      ],
    };
    const permuted = {
      ...extended,
      languages: [...extended.languages].reverse(),
      compilerConfigs: [...extended.compilerConfigs].reverse(),
      configFiles: [...extended.configFiles].reverse(),
    };
    const digestPort = new Rfc8785Sha256DigestAdapter();
    expect(digestPort.calculate(createProjectProfileCandidateDigestInput(extended))).toEqual(
      digestPort.calculate(createProjectProfileCandidateDigestInput(permuted)),
    );
  });
});

function duplicateCandidateCollection(field: CandidateCollectionField): unknown {
  const input = report();
  const candidate = input.profileCandidates[0]!;
  return {
    ...input,
    profileCandidates: [{ ...candidate, [field]: [candidate[field][0]!, candidate[field][0]!] }],
  };
}

function report() {
  return {
    schemaVersion: PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION,
    scannerVersion: PROJECT_SCANNER_VERSION,
    workspaceId: "workspace-discovery",
    workspaceGraphRevision: "graph-revision-1",
    status: ProjectDiscoveryStatus.Incomplete,
    profilePromotionStatus: ProjectProfilePromotionStatus.HumanReviewRequired,
    profileCandidates: [profile("repo-a"), profile("repo-b")],
    dependencyEdges: [
      {
        fromRepositoryId: "repo-a",
        toRepositoryId: "repo-b",
        kind: ProjectDependencyKind.Runtime,
        packageName: "@workspace/repo-b",
        sourcePath: "package.json",
      },
    ],
    dependencyAmbiguities: [
      {
        fromRepositoryId: "repo-a",
        kind: ProjectDependencyKind.Development,
        packageName: "shared-name",
        sourcePath: "package.json",
        owners: ["repo-a", "repo-b"],
      },
    ],
    digest: DIGEST,
  };
}

function profile(repositoryId: string) {
  const suffix = repositoryId.toLowerCase();
  return {
    schemaVersion: PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION,
    repositoryId,
    repositoryRevision: `revision-${suffix}`,
    roleHint: RepositoryRole.Application,
    status: ProjectDiscoveryStatus.Complete,
    inventory: {
      fileCount: 8,
      directoryCount: 3,
      skippedLinkCount: 1,
      ignoredDirectoryCount: 2,
    },
    languages: [{ languageId: "typescript", fileCount: 4 }],
    packageManagers: [{ manager: ProjectPackageManager.Pnpm, sourcePath: "pnpm-lock.yaml" }],
    packages: [
      {
        manifestPath: "package.json",
        packageName: `@workspace/${suffix}`,
        scriptNames: ["test"],
        workspacePatterns: ["packages/*"],
        dependencies: [
          {
            packageName: "zod",
            declaredRange: "^4.0.0",
            kind: ProjectDependencyKind.Runtime,
            manifestPath: "package.json",
          },
        ],
      },
    ],
    compilerConfigs: [
      {
        configPath: "tsconfig.json",
        strict: true,
        forceConsistentCasingInFileNames: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        pathAliasKeys: ["#domain/*"],
        extendsRef: "../../tsconfig.json",
      },
    ],
    frameworkHints: [
      {
        frameworkId: "vitest",
        packageName: "vitest",
        declaredRange: "^4.0.0",
        sourcePath: "package.json",
      },
    ],
    configFiles: [
      {
        kind: ProjectConfigKind.PackageManifest,
        relativePath: "package.json",
        contentDigest: DIGEST,
        parseStatus: ProjectConfigParseStatus.Parsed,
      },
    ],
    mechanismCandidates: [
      {
        schemaVersion: ARCHITECTURE_MECHANISM_CANDIDATE_SCHEMA_VERSION,
        candidateId: `mechanism-${suffix}`,
        repositoryId,
        kind: ProjectMechanismKind.DomainLayer,
        relativePath: "src/domain",
        confidence: ProjectCandidateConfidence.StructuralHeuristic,
        rationale: "The directory contains domain contracts.",
        digest: DIGEST,
      },
    ],
    ruleCandidates: [createRule({ ruleId: `rule.${suffix}` })],
    diagnostics: [
      {
        code: ProjectDiagnosticCode.SymbolicLinkSkipped,
        severity: ProjectDiagnosticSeverity.Warning,
        repositoryId,
        relativePath: "linked-source",
        message: "A symbolic link was skipped.",
      },
    ],
    digest: DIGEST,
  };
}
