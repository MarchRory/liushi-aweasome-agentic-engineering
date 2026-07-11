import type {
  ProjectDependencyAmbiguityCandidate,
  ProjectDependencyEdgeCandidate,
  ProjectProfileCandidate,
} from "#domain/projectDiscovery/index.js";

/** Package Name 解析后的确定依赖边与歧义候选。 */
export interface ProjectDependencyResolution {
  /** 可唯一解析的跨仓依赖边。 */
  dependencyEdges: readonly ProjectDependencyEdgeCandidate[];
  /** 存在多个 Package Owner 的依赖声明。 */
  dependencyAmbiguities: readonly ProjectDependencyAmbiguityCandidate[];
}

/** 根据 Package Name 解析显式多仓依赖边并保留所有歧义。 */
export function resolveProjectDependencies(
  profiles: readonly ProjectProfileCandidate[],
): ProjectDependencyResolution {
  const owners = new Map<string, Set<ProjectProfileCandidate["repositoryId"]>>();
  for (const profile of profiles) {
    for (const packageFact of profile.packages) {
      if (packageFact.packageName !== undefined) {
        const packageOwners = owners.get(packageFact.packageName) ?? new Set();
        packageOwners.add(profile.repositoryId);
        owners.set(packageFact.packageName, packageOwners);
      }
    }
  }

  const edges: ProjectDependencyEdgeCandidate[] = [];
  const ambiguities: ProjectDependencyAmbiguityCandidate[] = [];
  for (const profile of profiles) {
    for (const packageFact of profile.packages) {
      for (const dependency of packageFact.dependencies) {
        const candidates = [...(owners.get(dependency.packageName) ?? [])].sort(compare);
        if (candidates.length > 1) {
          ambiguities.push({
            fromRepositoryId: profile.repositoryId,
            kind: dependency.kind,
            packageName: dependency.packageName,
            sourcePath: dependency.manifestPath,
            owners: candidates,
          });
          continue;
        }
        const targetRepositoryId = candidates[0];
        if (targetRepositoryId !== undefined && targetRepositoryId !== profile.repositoryId) {
          edges.push({
            fromRepositoryId: profile.repositoryId,
            toRepositoryId: targetRepositoryId,
            kind: dependency.kind,
            packageName: dependency.packageName,
            sourcePath: dependency.manifestPath,
          });
        }
      }
    }
  }

  return {
    dependencyEdges: deduplicateAndSort(edges, edgeIdentity),
    dependencyAmbiguities: deduplicateAndSort(ambiguities, ambiguityIdentity),
  };
}

function edgeIdentity(edge: ProjectDependencyEdgeCandidate): string {
  return `${edge.fromRepositoryId}:${edge.toRepositoryId}:${edge.kind}:${edge.packageName}:${edge.sourcePath}`;
}

function ambiguityIdentity(ambiguity: ProjectDependencyAmbiguityCandidate): string {
  return `${ambiguity.fromRepositoryId}:${ambiguity.kind}:${ambiguity.packageName}:${ambiguity.sourcePath}:${ambiguity.owners.join(",")}`;
}

function deduplicateAndSort<T>(values: readonly T[], identity: (value: T) => string): readonly T[] {
  return [...new Map(values.map((value) => [identity(value), value])).values()].sort((a, b) =>
    compare(identity(a), identity(b)),
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
