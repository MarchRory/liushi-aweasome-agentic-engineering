import type { ContentDigestPort } from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import {
  FileInstallAction,
  ManagedOwnershipProvenance,
  serializeManagedManifest,
  type InstallationRevisionIntent,
} from "#domain/installation/index.js";

import { corruptRevision } from "../errors/index.js";
import {
  hasSameMetadata,
  hasSameOriginal,
  hasSamePersistedEntry,
  originalFromSnapshot,
} from "../ownership/index.js";
import { isSortedUniquePathSequence } from "./pathChecks.js";

/** 严格校验 Apply 后 Manifest 投影的摘要、排序、保留项及当前 Revision 条目。 */
export function verifyManifestProjection(
  intent: InstallationRevisionIntent,
  digest: ContentDigestPort,
  platform: NodeJS.Platform,
): Result<void, HarnessError> {
  const contentDigest = digest.calculate(intent.manifestAfter.content);
  if (
    contentDigest.status === ResultStatus.Failure ||
    contentDigest.value !== intent.manifestAfter.digest
  )
    return corruptRevision("Managed manifest projection digest is invalid.");
  const entryPaths = intent.manifestAfter.entries.map((entry) => entry.path);
  if (!isSortedUniquePathSequence(entryPaths, platform))
    return corruptRevision("Managed manifest projection paths must be unique and sorted.");
  if (serializeManagedManifest(intent.manifestAfter.entries) !== intent.manifestAfter.content)
    return corruptRevision("Managed manifest projection content does not match its entries.");

  const writableFiles = intent.plan.files.filter(
    (file) => file.action === FileInstallAction.Create || file.action === FileInstallAction.Update,
  );
  const currentEntries = intent.manifestAfter.entries.filter(
    (entry) => entry.installationRevisionId === intent.revisionId,
  );
  if (
    currentEntries.length !== writableFiles.length ||
    currentEntries.some((entry, index) => entry.path !== writableFiles[index]?.path)
  )
    return corruptRevision(
      "Current Revision manifest entries must match every writable plan path.",
    );

  const writablePathSet = new Set(writableFiles.map((file) => file.path));
  const expectedPreserved = intent.plan.manifest.entries.filter(
    (entry) => !writablePathSet.has(entry.path),
  );
  const actualPreserved = intent.manifestAfter.entries.filter(
    (entry) => !writablePathSet.has(entry.path),
  );
  if (
    expectedPreserved.length !== actualPreserved.length ||
    expectedPreserved.some(
      (entry, index) =>
        actualPreserved[index] === undefined ||
        !hasSamePersistedEntry(entry, actualPreserved[index]),
    )
  )
    return corruptRevision("Managed manifest projection must preserve every non-written entry.");

  const preimages = new Map(intent.preimages.map((snapshot) => [snapshot.path, snapshot]));
  for (const [index, file] of writableFiles.entries()) {
    const entry = currentEntries[index];
    const preimage = preimages.get(file.path);
    if (entry === undefined || preimage === undefined)
      return corruptRevision("Manifest entry is missing.");
    const expectedOriginal = file.persisted?.original ?? originalFromSnapshot(preimage);
    if (
      entry.repositoryId !== intent.plan.repositoryId ||
      entry.installPlanDigest !== intent.plan.planDigest ||
      entry.lastAppliedDigest !== file.desired.digest ||
      entry.provenance !== ManagedOwnershipProvenance.VerifiedRevision ||
      !hasSameOriginal(entry.original, expectedOriginal) ||
      !hasSameMetadata(entry.metadata, file.desired.metadata)
    )
      return corruptRevision("Managed manifest projection contains a forged current entry.");
  }
  return success(undefined);
}
