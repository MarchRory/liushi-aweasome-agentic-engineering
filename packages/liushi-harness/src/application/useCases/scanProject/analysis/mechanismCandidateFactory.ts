import type { ContentDigestPort } from "#application/ports/index.js";
import {
  ARCHITECTURE_MECHANISM_CANDIDATE_SCHEMA_VERSION,
  ResultStatus,
  type HarnessError,
  type Result,
  failure,
  success,
} from "#common/index.js";
import {
  ProjectCandidateConfidence,
  ProjectDiscoveryStatus,
  ProjectMechanismKind,
  createArchitectureMechanismCandidateDigestInput,
  type ArchitectureMechanismCandidate,
} from "#domain/projectDiscovery/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

const MECHANISM_BY_DIRECTORY = new Map<string, ProjectMechanismKind>([
  ["shared", ProjectMechanismKind.SharedLayer],
  ["common", ProjectMechanismKind.SharedLayer],
  ["packages", ProjectMechanismKind.SharedLayer],
  ["src", ProjectMechanismKind.SourceRoot],
  ["source", ProjectMechanismKind.SourceRoot],
  ["test", ProjectMechanismKind.TestRoot],
  ["tests", ProjectMechanismKind.TestRoot],
  ["__tests__", ProjectMechanismKind.TestRoot],
  ["api", ProjectMechanismKind.ApiLayer],
  ["service", ProjectMechanismKind.ApiLayer],
  ["services", ProjectMechanismKind.ApiLayer],
  ["client", ProjectMechanismKind.ApiLayer],
  ["clients", ProjectMechanismKind.ApiLayer],
  ["domain", ProjectMechanismKind.DomainLayer],
  ["infra", ProjectMechanismKind.InfrastructureLayer],
  ["infrastructure", ProjectMechanismKind.InfrastructureLayer],
  ["adapter", ProjectMechanismKind.InfrastructureLayer],
  ["adapters", ProjectMechanismKind.InfrastructureLayer],
  ["component", ProjectMechanismKind.ComponentLayer],
  ["components", ProjectMechanismKind.ComponentLayer],
  ["ui", ProjectMechanismKind.ComponentLayer],
  ["state", ProjectMechanismKind.StateLayer],
  ["store", ProjectMechanismKind.StateLayer],
  ["stores", ProjectMechanismKind.StateLayer],
  ["generated", ProjectMechanismKind.GeneratedBoundary],
  ["__generated__", ProjectMechanismKind.GeneratedBoundary],
]);

/** 从浅层目录名生成不带语义确认的 Architecture Mechanism Candidate。 */
export function createMechanismCandidates(
  repositoryId: RepositoryId,
  directories: readonly string[],
  status: ProjectDiscoveryStatus,
  digestPort: ContentDigestPort,
): Result<readonly ArchitectureMechanismCandidate[], HarnessError> {
  const candidates: ArchitectureMechanismCandidate[] = [];
  for (const relativePath of directories) {
    if (relativePath.split("/").length > 4) {
      continue;
    }
    const name = relativePath.slice(relativePath.lastIndexOf("/") + 1).toLowerCase();
    const kind = MECHANISM_BY_DIRECTORY.get(name);
    if (kind === undefined) {
      continue;
    }
    const input = {
      schemaVersion: ARCHITECTURE_MECHANISM_CANDIDATE_SCHEMA_VERSION,
      candidateId: `mechanism:${kind}:${relativePath}`,
      repositoryId,
      kind,
      relativePath,
      confidence:
        status === ProjectDiscoveryStatus.Complete
          ? ProjectCandidateConfidence.StructuralHeuristic
          : ProjectCandidateConfidence.PartialScan,
      rationale:
        "Directory naming suggests a project mechanism, but frequency does not prove intent.",
    } as const;
    const digest = digestPort.calculate(createArchitectureMechanismCandidateDigestInput(input));
    if (digest.status === ResultStatus.Failure) {
      return failure(digest.error);
    }
    candidates.push({ ...input, digest: digest.value });
  }

  return success(candidates.sort((left, right) => compare(left.candidateId, right.candidateId)));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
