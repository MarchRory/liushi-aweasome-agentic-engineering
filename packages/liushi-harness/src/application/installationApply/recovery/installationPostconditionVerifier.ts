import type { ManagedFileStateReader } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  MANAGED_FILES_MANIFEST_PATH,
  ManagedFileActualKind,
  ManagedManifestState,
  type InstallationRevisionIntent,
} from "#domain/installation/index.js";

/** 验证受管文件和 Manifest 已达到 Revision 的目标摘要。 */
export async function verifyInstallationPostconditions(
  intent: InstallationRevisionIntent,
  reader: ManagedFileStateReader,
): Promise<Result<void, HarnessError>> {
  for (const file of intent.plan.files) {
    const actual = await reader.readActual(intent.plan.root, file.path);
    if (
      actual.status === ResultStatus.Failure ||
      actual.value.kind !== ManagedFileActualKind.RegularFile ||
      actual.value.digest !== file.desired.digest
    )
      return failure(
        new HarnessError(
          HarnessErrorCode.InstallationRecoveryRequired,
          "Managed file postcondition is not satisfied.",
          { revisionId: intent.revisionId, path: file.path },
          actual.status === ResultStatus.Failure ? actual.error : undefined,
        ),
      );
  }
  const manifest = await reader.readManifest(intent.plan.root);
  if (
    manifest.status === ResultStatus.Failure ||
    manifest.value.state !== ManagedManifestState.Present ||
    manifest.value.digest !== intent.manifestAfter.digest
  )
    return failure(
      new HarnessError(
        HarnessErrorCode.InstallationRecoveryRequired,
        "Managed manifest postcondition is not satisfied.",
        { revisionId: intent.revisionId, path: MANAGED_FILES_MANIFEST_PATH },
        manifest.status === ResultStatus.Failure ? manifest.error : undefined,
      ),
    );
  return success(undefined);
}
