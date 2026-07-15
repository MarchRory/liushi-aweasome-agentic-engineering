import type { ContentDigestPort } from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import {
  FileInstallAction,
  ManagedFileActualKind,
  type InstallationRevisionIntent,
} from "#domain/installation/index.js";

import { corruptRevision } from "../errors/index.js";
import { isSortedUniquePathSequence } from "./pathChecks.js";

/** 严格校验 Intent preimage 与可写 InstallPlan 路径及实际状态的一致性。 */
export function verifyPreimages(
  intent: InstallationRevisionIntent,
  digest: ContentDigestPort,
  platform: NodeJS.Platform,
): Result<void, HarnessError> {
  const writableFiles = intent.plan.files.filter(
    (file) => file.action === FileInstallAction.Create || file.action === FileInstallAction.Update,
  );
  const writablePaths = writableFiles.map((file) => file.path);
  const preimagePaths = intent.preimages.map((snapshot) => snapshot.path);
  if (
    !isSortedUniquePathSequence(preimagePaths, platform) ||
    writablePaths.length !== preimagePaths.length ||
    writablePaths.some((path, index) => path !== preimagePaths[index])
  )
    return corruptRevision("Preimages must correspond one-to-one with writable plan paths.");

  for (const [index, snapshot] of intent.preimages.entries()) {
    const file = writableFiles[index];
    if (
      file === undefined ||
      snapshot.path !== file.actual.path ||
      snapshot.kind !== file.actual.kind
    )
      return corruptRevision("Preimage does not match the InstallPlan actual state.");
    if (snapshot.kind === ManagedFileActualKind.RegularFile) {
      const contentDigest = digest.calculate(snapshot.content);
      if (
        contentDigest.status === ResultStatus.Failure ||
        contentDigest.value !== snapshot.digest ||
        snapshot.digest !== file.actual.digest
      )
        return corruptRevision("Preimage content or digest is invalid.");
    }
  }
  return success(undefined);
}
