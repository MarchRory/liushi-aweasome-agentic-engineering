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
  /** 稳定排序的诊断。 */
  diagnostics: readonly ProjectDiscoveryDiagnostic[];
  /** 由诊断事实计算的完整性状态。 */
  status: ProjectDiscoveryStatus;
}

/** 将 FileSystem 与配置诊断聚合为 Project 状态。 */
export function assembleProjectDiagnostics(
  repositoryId: RepositoryId,
  inventory: ProjectRepositoryFileInventory,
  configDiagnostics: readonly ProjectDiscoveryDiagnostic[],
): ProjectDiagnosticAssembly {
  const diagnostics: ProjectDiscoveryDiagnostic[] = [...configDiagnostics];
  diagnostics.push(
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

  const sorted = diagnostics.sort((left, right) =>
    compare(
      `${left.code}:${left.relativePath ?? ""}:${left.message}`,
      `${right.code}:${right.relativePath ?? ""}:${right.message}`,
    ),
  );
  return { diagnostics: sorted, status: determineStatus(sorted) };
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

function determineStatus(
  diagnostics: readonly ProjectDiscoveryDiagnostic[],
): ProjectDiscoveryStatus {
  return diagnostics.some((entry) => entry.severity === ProjectDiagnosticSeverity.Blocking)
    ? ProjectDiscoveryStatus.Incomplete
    : ProjectDiscoveryStatus.Complete;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
