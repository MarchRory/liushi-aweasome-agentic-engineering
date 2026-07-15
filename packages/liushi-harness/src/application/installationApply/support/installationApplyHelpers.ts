import {
  FileInstallAction,
  MANAGED_FILES_MANIFEST_PATH,
  ManagedFileActualKind,
  ManagedManifestState,
  type ActualManagedFileState,
  type InstallPlan,
} from "#domain/installation/index.js";

/** 选取计划中需要实际写入的受管文件。 */
export function writableInstallationFiles(
  plan: InstallPlan,
): readonly InstallPlan["files"][number][] {
  return plan.files.filter(
    (file) => file.action === FileInstallAction.Create || file.action === FileInstallAction.Update,
  );
}

/** 根据计划创建 Manifest 写入前应匹配的现场状态。 */
export function installationManifestActual(plan: InstallPlan): ActualManagedFileState {
  return plan.manifest.state === ManagedManifestState.Missing
    ? { path: MANAGED_FILES_MANIFEST_PATH, kind: ManagedFileActualKind.Missing as const }
    : {
        path: MANAGED_FILES_MANIFEST_PATH,
        kind: ManagedFileActualKind.RegularFile as const,
        digest: plan.manifest.digest,
      };
}
