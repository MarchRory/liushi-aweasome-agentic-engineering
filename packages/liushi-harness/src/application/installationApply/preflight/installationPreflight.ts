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
  FileInstallAction,
  MANAGED_FILES_MANIFEST_PATH,
  ManagedFileActualKind,
  ManagedManifestState,
  type ActualManagedFileState,
  type InstallPlan,
  type ManagedFileContentSnapshot,
  type ManagedManifestSnapshot,
} from "#domain/installation/index.js";

/** 在持久化 Intent 前完成的只读 Repository 前置检查结果。 */
export interface InstallationPreflightResult {
  /** 需要写入的受管文件在 Apply 前的完整内容快照。 */
  readonly preimages: readonly ManagedFileContentSnapshot[];
  /** 写入计划路径所需创建的缺失父目录。 */
  readonly createdDirectories: readonly string[];
}

/** 重新核对计划绑定的完整现场，并采集 rollback 所需前镜像。 */
export async function runInstallationPreflight(
  plan: InstallPlan,
  reader: ManagedFileStateReader,
): Promise<Result<InstallationPreflightResult, HarnessError>> {
  if (plan.files.some((file) => file.action === FileInstallAction.Conflict))
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "InstallPlan contains conflicts and cannot be applied.",
        { planId: plan.planId },
      ),
    );
  const currentManifest = await reader.readManifest(plan.root);
  if (currentManifest.status === ResultStatus.Failure) return currentManifest;
  if (!sameManifest(currentManifest.value, plan.manifest))
    return stalePlan(MANAGED_FILES_MANIFEST_PATH);

  const preimages: ManagedFileContentSnapshot[] = [];
  const writablePaths: string[] = [];
  for (const file of plan.files) {
    const actual = await reader.readActual(plan.root, file.path);
    if (actual.status === ResultStatus.Failure) return actual;
    if (!sameActual(actual.value, file.actual)) return stalePlan(file.path);
    if (file.action !== FileInstallAction.Create && file.action !== FileInstallAction.Update)
      continue;
    const preimage = await reader.readContentSnapshot(plan.root, file.path);
    if (preimage.status === ResultStatus.Failure) return preimage;
    if (!sameSnapshotAndActual(preimage.value, file.actual)) return stalePlan(file.path);
    preimages.push(preimage.value);
    writablePaths.push(file.path);
  }
  const directories = await reader.findMissingParentDirectories(plan.root, [
    ...writablePaths,
    MANAGED_FILES_MANIFEST_PATH,
  ]);
  return directories.status === ResultStatus.Failure
    ? directories
    : success({ preimages, createdDirectories: directories.value });
}

/** 比较受管文件现场，忽略普通文件之外不应存在的摘要字段。 */
export function sameActual(left: ActualManagedFileState, right: ActualManagedFileState): boolean {
  return (
    left.path === right.path &&
    left.kind === right.kind &&
    (left.kind !== ManagedFileActualKind.RegularFile || left.digest === right.digest)
  );
}

/** 比较同一路径的完整快照与摘要现场。 */
export function sameSnapshotAndActual(
  snapshot: ManagedFileContentSnapshot,
  actual: ActualManagedFileState,
): boolean {
  return (
    snapshot.path === actual.path &&
    snapshot.kind === actual.kind &&
    (snapshot.kind !== ManagedFileActualKind.RegularFile || snapshot.digest === actual.digest)
  );
}

/** 比较 manifest 缺失状态或同一次读取绑定的原文摘要。 */
export function sameManifest(
  left: ManagedManifestSnapshot,
  right: ManagedManifestSnapshot,
): boolean {
  return (
    left.state === right.state &&
    (left.state === ManagedManifestState.Missing ||
      (right.state === ManagedManifestState.Present && left.digest === right.digest))
  );
}

function stalePlan(path: string): Result<never, HarnessError> {
  return failure(
    new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Repository state changed after InstallPlan creation.",
      { path },
    ),
  );
}
