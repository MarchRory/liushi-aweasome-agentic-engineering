import {
  FileInstallAction,
  MANAGED_FILES_MANIFEST_PATH,
  compareManagedFilePath,
  type InstallationRevisionIntent,
} from "#domain/installation/index.js";
import { normalizePathIdentity } from "#infrastructure/system/platformCompatibility/index.js";

/** 校验受管路径序列的排序、字面唯一性与平台身份唯一性。 */
export function isSortedUniquePathSequence(
  paths: readonly string[],
  platform: NodeJS.Platform,
): boolean {
  const sorted = [...paths].sort(compareManagedFilePath);
  const identities = paths.map((path) => normalizePathIdentity(path, platform));
  return (
    paths.every((path, index) => path === sorted[index]) &&
    new Set(paths).size === paths.length &&
    new Set(identities).size === identities.length
  );
}

/** 校验创建目录只覆盖受管写入目标及 Manifest 的父目录。 */
export function hasOnlyTargetParentDirectories(intent: InstallationRevisionIntent): boolean {
  const targets = [
    ...intent.plan.files
      .filter(
        (file) =>
          file.action === FileInstallAction.Create || file.action === FileInstallAction.Update,
      )
      .map((file) => file.path),
    MANAGED_FILES_MANIFEST_PATH,
  ];
  const allowed = new Set<string>();
  for (const target of targets) {
    const segments = target.split("/");
    for (let index = 1; index < segments.length; index += 1)
      allowed.add(segments.slice(0, index).join("/"));
  }
  return intent.createdDirectories.every((path) => allowed.has(path));
}
