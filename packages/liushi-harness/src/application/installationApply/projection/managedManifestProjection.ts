import type { ContentDigestPort } from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import {
  FileInstallAction,
  ManagedFileActualKind,
  ManagedOwnershipProvenance,
  compareManagedFilePath,
  serializeManagedManifest,
  type InstallPlan,
  type InstallationRevisionId,
  type ManagedFileOriginalState,
  type ManagedManifestProjection,
  type PersistedManagedFileState,
} from "#domain/installation/index.js";

/** 从批准计划生成包含既有非目标条目的完整 Manifest 后镜像。 */
export function createManagedManifestProjection(
  plan: InstallPlan,
  revisionId: InstallationRevisionId,
  digest: ContentDigestPort,
): Result<ManagedManifestProjection, HarnessError> {
  const entries = new Map(plan.manifest.entries.map((entry) => [entry.path, entry] as const));
  for (const file of plan.files) {
    if (file.action !== FileInstallAction.Create && file.action !== FileInstallAction.Update)
      continue;
    entries.set(file.path, {
      path: file.path,
      lastAppliedDigest: file.desired.digest,
      repositoryId: plan.repositoryId,
      installationRevisionId: revisionId,
      installPlanDigest: plan.planDigest,
      original: resolveOriginalState(file),
      provenance: ManagedOwnershipProvenance.VerifiedRevision,
      metadata: file.desired.metadata,
    });
  }
  const projectedEntries = [...entries.values()].sort((left, right) =>
    compareManagedFilePath(left.path, right.path),
  ) as readonly PersistedManagedFileState[];
  const content = serializeManagedManifest(projectedEntries);
  const contentDigest = digest.calculate(content);
  return contentDigest.status === ResultStatus.Failure
    ? contentDigest
    : success({ content, digest: contentDigest.value, entries: projectedEntries });
}

function resolveOriginalState(file: InstallPlan["files"][number]): ManagedFileOriginalState {
  if (file.persisted !== undefined) return file.persisted.original;
  return { kind: ManagedFileActualKind.Missing };
}
