import type { ProjectRepositoryFileInventory } from "#application/ports/index.js";
import {
  ProjectDiagnosticCode,
  ProjectDiagnosticSeverity,
  ProjectDiscoveryStatus,
  type ProjectDiscoveryDiagnostic,
} from "#domain/projectDiscovery/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

/** Repository 诊断与完整性聚合结果。 */
export interface ProjectDiagnosticAssembly {
  /** 受预算限制并稳定排序的诊断。 */
  diagnostics: readonly ProjectDiscoveryDiagnostic[];
  /** 由诊断与截断事实计算的完整性状态。 */
  status: ProjectDiscoveryStatus;
}

/** 将 FileSystem 与配置诊断聚合为受预算 Project 状态。 */
export function assembleProjectDiagnostics(
  repositoryId: RepositoryId,
  inventory: ProjectRepositoryFileInventory,
  configDiagnostics: readonly ProjectDiscoveryDiagnostic[],
  configFileLimitReached: boolean,
  maxDiagnostics: number,
): ProjectDiagnosticAssembly {
  const diagnostics: ProjectDiscoveryDiagnostic[] = [...configDiagnostics];
  if (inventory.fileLimitReached) {
    diagnostics.push(diagnostic(repositoryId, ProjectDiagnosticCode.FileLimitReached));
  }
  if (inventory.directoryLimitReached) {
    diagnostics.push(diagnostic(repositoryId, ProjectDiagnosticCode.DirectoryLimitReached));
  }
  diagnostics.push(
    ...inventory.depthLimitedPaths.map((relativePath) =>
      diagnostic(repositoryId, ProjectDiagnosticCode.DepthLimitReached, relativePath),
    ),
    ...inventory.skippedLinks.map((relativePath) =>
      diagnostic(repositoryId, ProjectDiagnosticCode.SymbolicLinkSkipped, relativePath),
    ),
    ...inventory.unreadablePaths.map((relativePath) =>
      diagnostic(repositoryId, ProjectDiagnosticCode.PathUnreadable, relativePath),
    ),
    ...inventory.caseCollisions.map((collision) => ({
      code: ProjectDiagnosticCode.CaseCollision,
      severity: ProjectDiagnosticSeverity.Blocking,
      repositoryId,
      relativePath: collision.firstPath,
      message: `Repository contains a case-insensitive path collision with ${collision.secondPath}.`,
    })),
  );
  if (configFileLimitReached) {
    diagnostics.push(diagnostic(repositoryId, ProjectDiagnosticCode.ConfigFileLimitReached));
  }

  const sorted = diagnostics.sort((left, right) =>
    compare(
      `${left.code}:${left.relativePath ?? ""}:${left.message}`,
      `${right.code}:${right.relativePath ?? ""}:${right.message}`,
    ),
  );
  const limited = limitDiagnostics(sorted, repositoryId, maxDiagnostics);
  return { diagnostics: limited, status: determineStatus(limited) };
}

function diagnostic(
  repositoryId: RepositoryId,
  code: ProjectDiagnosticCode,
  relativePath?: string,
): ProjectDiscoveryDiagnostic {
  return {
    code,
    severity: ProjectDiagnosticSeverity.Blocking,
    repositoryId,
    ...(relativePath === undefined ? {} : { relativePath }),
    message: "Project scan skipped content required for a complete candidate.",
  };
}

function limitDiagnostics(
  diagnostics: readonly ProjectDiscoveryDiagnostic[],
  repositoryId: RepositoryId,
  maxDiagnostics: number,
): readonly ProjectDiscoveryDiagnostic[] {
  if (diagnostics.length <= maxDiagnostics) {
    return diagnostics;
  }
  return [
    ...diagnostics.slice(0, Math.max(0, maxDiagnostics - 1)),
    diagnostic(repositoryId, ProjectDiagnosticCode.DiagnosticLimitReached),
  ];
}

function determineStatus(
  diagnostics: readonly ProjectDiscoveryDiagnostic[],
): ProjectDiscoveryStatus {
  const truncatedCodes = new Set([
    ProjectDiagnosticCode.FileLimitReached,
    ProjectDiagnosticCode.DirectoryLimitReached,
    ProjectDiagnosticCode.DepthLimitReached,
    ProjectDiagnosticCode.ConfigFileLimitReached,
    ProjectDiagnosticCode.ConfigFileTooLarge,
    ProjectDiagnosticCode.ConfigByteLimitReached,
    ProjectDiagnosticCode.DiagnosticLimitReached,
  ]);
  if (diagnostics.some((entry) => truncatedCodes.has(entry.code))) {
    return ProjectDiscoveryStatus.Truncated;
  }
  return diagnostics.some((entry) => entry.severity === ProjectDiagnosticSeverity.Blocking)
    ? ProjectDiscoveryStatus.Incomplete
    : ProjectDiscoveryStatus.Complete;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
