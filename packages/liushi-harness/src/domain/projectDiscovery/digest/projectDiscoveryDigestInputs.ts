import type {
  ArchitectureMechanismCandidate,
  ArchitectureMechanismCandidateDigestInput,
  ProjectDiscoveryDiagnostic,
  ProjectDiscoveryReport,
  ProjectDiscoveryReportDigestInput,
  ProjectProfileCandidate,
  ProjectProfileCandidateDigestInput,
} from "../contracts/index.js";
import { createRuleDigestInput } from "#domain/rule/index.js";

/** 创建排除自引用 digest 的 Architecture Mechanism Candidate 输入。 */
export function createArchitectureMechanismCandidateDigestInput(
  candidate: ArchitectureMechanismCandidate | ArchitectureMechanismCandidateDigestInput,
): ArchitectureMechanismCandidateDigestInput {
  return {
    schemaVersion: candidate.schemaVersion,
    candidateId: candidate.candidateId,
    repositoryId: candidate.repositoryId,
    kind: candidate.kind,
    relativePath: candidate.relativePath,
    confidence: candidate.confidence,
    rationale: candidate.rationale,
  };
}

/** 创建集合字段稳定排序的 Project Profile Candidate Digest 输入。 */
export function createProjectProfileCandidateDigestInput(
  candidate: ProjectProfileCandidate | ProjectProfileCandidateDigestInput,
): ProjectProfileCandidateDigestInput {
  return {
    schemaVersion: candidate.schemaVersion,
    repositoryId: candidate.repositoryId,
    repositoryRevision: candidate.repositoryRevision,
    ...(candidate.roleHint === undefined ? {} : { roleHint: candidate.roleHint }),
    status: candidate.status,
    inventory: candidate.inventory,
    languages: [...candidate.languages].sort((a, b) => compare(a.languageId, b.languageId)),
    packageManagers: [...candidate.packageManagers].sort((a, b) =>
      compare(`${a.manager}:${a.sourcePath}`, `${b.manager}:${b.sourcePath}`),
    ),
    packages: candidate.packages
      .map((fact) => ({
        ...fact,
        scriptNames: [...fact.scriptNames].sort(compare),
        workspacePatterns: [...fact.workspacePatterns].sort(compare),
        dependencies: [...fact.dependencies].sort((a, b) =>
          compare(dependencyIdentity(a), dependencyIdentity(b)),
        ),
      }))
      .sort((a, b) => compare(a.manifestPath, b.manifestPath)),
    compilerConfigs: candidate.compilerConfigs
      .map((fact) => ({ ...fact, pathAliasKeys: [...fact.pathAliasKeys].sort(compare) }))
      .sort((a, b) => compare(a.configPath, b.configPath)),
    frameworkHints: [...candidate.frameworkHints].sort((a, b) =>
      compare(frameworkIdentity(a), frameworkIdentity(b)),
    ),
    configFiles: [...candidate.configFiles].sort((a, b) =>
      compare(`${a.kind}:${a.relativePath}`, `${b.kind}:${b.relativePath}`),
    ),
    mechanismCandidates: candidate.mechanismCandidates
      .map((mechanism) => ({
        ...createArchitectureMechanismCandidateDigestInput(mechanism),
        digest: mechanism.digest,
      }))
      .sort((a, b) => compare(a.candidateId, b.candidateId)),
    ruleCandidates: candidate.ruleCandidates
      .map((rule) => ({ ...createRuleDigestInput(rule), digest: rule.digest }))
      .sort((a, b) =>
        compare(`${a.ruleId}@${a.version}#${a.digest}`, `${b.ruleId}@${b.version}#${b.digest}`),
      ),
    diagnostics: sortDiagnostics(candidate.diagnostics),
  };
}

/** 创建集合字段稳定排序的 Project Discovery Report Digest 输入。 */
export function createProjectDiscoveryReportDigestInput(
  report: ProjectDiscoveryReport | ProjectDiscoveryReportDigestInput,
): ProjectDiscoveryReportDigestInput {
  return {
    schemaVersion: report.schemaVersion,
    scannerVersion: report.scannerVersion,
    workspaceId: report.workspaceId,
    workspaceGraphRevision: report.workspaceGraphRevision,
    budget: report.budget,
    status: report.status,
    profilePromotionStatus: report.profilePromotionStatus,
    profileCandidates: report.profileCandidates
      .map((profile) => ({
        ...createProjectProfileCandidateDigestInput(profile),
        digest: profile.digest,
      }))
      .sort((a, b) => compare(a.repositoryId, b.repositoryId)),
    dependencyEdges: [...report.dependencyEdges].sort((a, b) =>
      compare(
        `${a.fromRepositoryId}:${a.toRepositoryId}:${a.kind}:${a.packageName}:${a.sourcePath}`,
        `${b.fromRepositoryId}:${b.toRepositoryId}:${b.kind}:${b.packageName}:${b.sourcePath}`,
      ),
    ),
    dependencyAmbiguities: report.dependencyAmbiguities
      .map((ambiguity) => ({ ...ambiguity, owners: [...ambiguity.owners].sort(compare) }))
      .sort((a, b) =>
        compare(
          `${a.fromRepositoryId}:${a.kind}:${a.packageName}:${a.sourcePath}:${a.owners.join(",")}`,
          `${b.fromRepositoryId}:${b.kind}:${b.packageName}:${b.sourcePath}:${b.owners.join(",")}`,
        ),
      ),
  };
}

function sortDiagnostics(
  diagnostics: readonly ProjectDiscoveryDiagnostic[],
): readonly ProjectDiscoveryDiagnostic[] {
  return [...diagnostics].sort((a, b) => compare(diagnosticIdentity(a), diagnosticIdentity(b)));
}

function dependencyIdentity(
  dependency: ProjectProfileCandidate["packages"][number]["dependencies"][number],
): string {
  return `${dependency.packageName}:${dependency.kind}:${dependency.declaredRange}:${dependency.manifestPath}`;
}

function frameworkIdentity(framework: ProjectProfileCandidate["frameworkHints"][number]): string {
  return `${framework.frameworkId}:${framework.packageName}:${framework.declaredRange}:${framework.sourcePath}`;
}

function diagnosticIdentity(diagnostic: ProjectDiscoveryDiagnostic): string {
  return `${diagnostic.repositoryId}:${diagnostic.code}:${diagnostic.severity}:${diagnostic.relativePath ?? ""}:${diagnostic.message}`;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
