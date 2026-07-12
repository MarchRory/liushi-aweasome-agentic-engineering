import type {
  ProjectProfile,
  ProjectProfileBundle,
  ProjectProfileBundleDigestInput,
  ProjectProfileDigestInput,
} from "../contracts/index.js";

/** 创建不包含自引用 digest 的稳定 ProjectProfile Digest 输入。 */
export function createProjectProfileDigestInput(
  profile: ProjectProfile,
): ProjectProfileDigestInput {
  return {
    schemaVersion: profile.schemaVersion,
    workspaceId: profile.workspaceId,
    workspaceGraphRevision: profile.workspaceGraphRevision,
    revision: profile.revision,
    repositoryId: profile.repositoryId,
    repositoryRevision: profile.repositoryRevision,
    confirmedRole: profile.confirmedRole,
    facts: {
      inventory: profile.facts.inventory,
      languages: [...profile.facts.languages].sort((a, b) =>
        compare(`${a.languageId}:${a.fileCount}`, `${b.languageId}:${b.fileCount}`),
      ),
      packageManagers: [...profile.facts.packageManagers].sort((a, b) =>
        compare(`${a.manager}:${a.sourcePath}`, `${b.manager}:${b.sourcePath}`),
      ),
      packages: profile.facts.packages
        .map(normalizePackage)
        .sort((a, b) => compare(packageIdentity(a), packageIdentity(b))),
      compilerConfigs: profile.facts.compilerConfigs
        .map((fact) => ({ ...fact, pathAliasKeys: [...fact.pathAliasKeys].sort(compare) }))
        .sort((a, b) => compare(compilerIdentity(a), compilerIdentity(b))),
      frameworkHints: [...profile.facts.frameworkHints].sort((a, b) =>
        compare(
          `${a.frameworkId}:${a.packageName}:${a.declaredRange}:${a.sourcePath}`,
          `${b.frameworkId}:${b.packageName}:${b.declaredRange}:${b.sourcePath}`,
        ),
      ),
      configFiles: [...profile.facts.configFiles].sort((a, b) =>
        compare(`${a.kind}:${a.relativePath}`, `${b.kind}:${b.relativePath}`),
      ),
    },
    acceptedMechanisms: [...profile.acceptedMechanisms].sort((a, b) =>
      compare(mechanismIdentity(a), mechanismIdentity(b)),
    ),
    sourceRefs: {
      discoveryReportDigest: profile.sourceRefs.discoveryReportDigest,
      profileCandidateDigest: profile.sourceRefs.profileCandidateDigest,
      proposalArtifactDigest: profile.sourceRefs.proposalArtifactDigest,
      approvalId: profile.sourceRefs.approvalId,
    },
  };
}

/** 创建不包含自引用 digest 的稳定 ProjectProfileBundle Digest 输入。 */
export function createProjectProfileBundleDigestInput(
  bundle: ProjectProfileBundle,
): ProjectProfileBundleDigestInput {
  return {
    schemaVersion: bundle.schemaVersion,
    workspaceId: bundle.workspaceId,
    workspaceGraphRevision: bundle.workspaceGraphRevision,
    revision: bundle.revision,
    profiles: [...bundle.profiles]
      .sort((a, b) =>
        compare(
          `${a.repositoryId}:${a.repositoryRevision}:${a.digest}`,
          `${b.repositoryId}:${b.repositoryRevision}:${b.digest}`,
        ),
      )
      .map(normalizeProfile),
    ruleCatalogDigest: bundle.ruleCatalog.digest,
    provenance: bundle.provenance,
  };
}

function normalizeProfile(profile: ProjectProfile): ProjectProfile {
  return {
    ...createProjectProfileDigestInput(profile),
    digest: profile.digest,
  };
}

function normalizePackage(fact: ProjectProfile["facts"]["packages"][number]) {
  return {
    ...fact,
    scriptNames: [...fact.scriptNames].sort(compare),
    workspacePatterns: [...fact.workspacePatterns].sort(compare),
    dependencies: [...fact.dependencies].sort((a, b) =>
      compare(
        `${a.packageName}:${a.kind}:${a.declaredRange}:${a.manifestPath}`,
        `${b.packageName}:${b.kind}:${b.declaredRange}:${b.manifestPath}`,
      ),
    ),
  };
}

function packageIdentity(fact: ReturnType<typeof normalizePackage>): string {
  return `${fact.manifestPath}:${fact.packageName ?? ""}:${fact.scriptNames.join(",")}:${fact.workspacePatterns.join(",")}:${fact.dependencies.map((item) => `${item.packageName}:${item.kind}:${item.declaredRange}:${item.manifestPath}`).join(",")}`;
}

function compilerIdentity(fact: ProjectProfile["facts"]["compilerConfigs"][number]): string {
  return `${fact.configPath}:${String(fact.strict)}:${String(fact.forceConsistentCasingInFileNames)}:${String(fact.noUncheckedIndexedAccess)}:${String(fact.exactOptionalPropertyTypes)}:${fact.pathAliasKeys.join(",")}:${fact.extendsRef ?? ""}`;
}

function mechanismIdentity(mechanism: ProjectProfile["acceptedMechanisms"][number]): string {
  return `${mechanism.candidateId}:${mechanism.repositoryId}:${mechanism.kind}:${mechanism.relativePath}:${mechanism.confidence}:${mechanism.rationale}:${mechanism.digest}`;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
