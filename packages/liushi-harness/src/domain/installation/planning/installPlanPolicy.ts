import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import type {
  ActualManagedFileState,
  DesiredManagedFile,
  FileInstallPlan,
  PersistedManagedFileState,
} from "../contracts/index.js";
import {
  FileInstallAction,
  ManagedFileActualKind,
  ManagedOwnershipProvenance,
} from "../enums/index.js";

/** 对单个文件执行无副作用、表驱动的所有权规划决策。 */
export function planManagedFile(
  desired: DesiredManagedFile,
  actual: ActualManagedFileState,
  persisted?: PersistedManagedFileState,
): Result<FileInstallPlan, HarnessError> {
  if (
    desired.path !== actual.path ||
    (persisted !== undefined && persisted.path !== desired.path)
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Managed file states must reference the same path.",
      ),
    );
  }
  if (actual.kind === ManagedFileActualKind.Unsupported)
    return success({
      path: desired.path,
      action: FileInstallAction.Conflict,
      desired,
      actual,
      ...(persisted === undefined ? {} : { persisted }),
    });
  if (
    persisted !== undefined &&
    (persisted.provenance !== ManagedOwnershipProvenance.VerifiedRevision ||
      !hasSameManagedFileOwner(desired, persisted))
  )
    return success({
      path: desired.path,
      action: FileInstallAction.Conflict,
      desired,
      actual,
      persisted,
    });
  if (persisted === undefined) {
    return success({
      path: desired.path,
      action:
        actual.kind === ManagedFileActualKind.Missing
          ? FileInstallAction.Create
          : FileInstallAction.Conflict,
      desired,
      actual,
    });
  }
  if (
    actual.kind !== ManagedFileActualKind.RegularFile ||
    actual.digest !== persisted.lastAppliedDigest
  ) {
    return success({
      path: desired.path,
      action: FileInstallAction.Conflict,
      desired,
      actual,
      persisted,
    });
  }
  return success({
    path: desired.path,
    action: actual.digest === desired.digest ? FileInstallAction.Skip : FileInstallAction.Update,
    desired,
    actual,
    persisted,
  });
}

/** 比较稳定所有权身份；版本和来源摘要变化属于同一所有者的升级。 */
export function hasSameManagedFileOwner(
  desired: DesiredManagedFile,
  persisted: PersistedManagedFileState,
): boolean {
  return (
    desired.metadata.ownerPackage === persisted.metadata.ownerPackage &&
    desired.metadata.profile === persisted.metadata.profile &&
    desired.metadata.template === persisted.metadata.template &&
    desired.metadata.source === persisted.metadata.source
  );
}
