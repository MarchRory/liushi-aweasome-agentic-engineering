import type { ContentDigestPort } from "#application/ports/index.js";
import {
  PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION,
  ResultStatus,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";
import {
  PROJECT_SCANNER_VERSION,
  ProjectDiscoveryStatus,
  ProjectProfilePromotionStatus,
  createProjectDiscoveryReportDigestInput,
  type ProjectDiscoveryReport,
  type ProjectProfileCandidate,
  type ProjectScanManifest,
} from "#domain/projectDiscovery/index.js";

import { resolveProjectDependencies } from "./dependencyEdgeResolver.js";

/** 组装多仓 Project Discovery Report 并计算稳定 Digest。 */
export function assembleProjectDiscoveryReport(
  manifest: ProjectScanManifest,
  profiles: readonly ProjectProfileCandidate[],
  digestPort: ContentDigestPort,
): Result<ProjectDiscoveryReport, HarnessError> {
  const sortedProfiles = [...profiles].sort((a, b) => compare(a.repositoryId, b.repositoryId));
  const dependencies = resolveProjectDependencies(sortedProfiles);
  const reportWithoutDigest = {
    schemaVersion: PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION,
    scannerVersion: PROJECT_SCANNER_VERSION,
    workspaceId: manifest.workspaceId,
    workspaceGraphRevision: manifest.workspaceGraphRevision,
    status: aggregateStatus(sortedProfiles, dependencies.dependencyAmbiguities.length > 0),
    profilePromotionStatus: ProjectProfilePromotionStatus.HumanReviewRequired,
    profileCandidates: sortedProfiles,
    ...dependencies,
  } as const;
  const digest = digestPort.calculate(createProjectDiscoveryReportDigestInput(reportWithoutDigest));
  if (digest.status === ResultStatus.Failure) {
    return failure(digest.error);
  }
  return success({ ...reportWithoutDigest, digest: digest.value });
}

function aggregateStatus(
  profiles: readonly ProjectProfileCandidate[],
  hasDependencyAmbiguity: boolean,
): ProjectDiscoveryStatus {
  return hasDependencyAmbiguity ||
    profiles.some((profile) => profile.status === ProjectDiscoveryStatus.Incomplete)
    ? ProjectDiscoveryStatus.Incomplete
    : ProjectDiscoveryStatus.Complete;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
