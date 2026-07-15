import { MANAGED_FILE_MANIFEST_SCHEMA_VERSION } from "../constants/index.js";
import type { PersistedManagedFileState } from "../contracts/index.js";
import { ManagedFileActualKind } from "../enums/index.js";
import { compareManagedFilePath } from "../validation/index.js";

/** 生成字段封闭、路径稳定排序且以换行结尾的 Manifest JSON。 */
export function serializeManagedManifest(entries: readonly PersistedManagedFileState[]): string {
  const persistedEntries = [...entries]
    .sort((left, right) => compareManagedFilePath(left.path, right.path))
    .map((entry) => ({
      path: entry.path,
      lastAppliedDigest: entry.lastAppliedDigest,
      repositoryId: entry.repositoryId,
      installationRevisionId: entry.installationRevisionId,
      installPlanDigest: entry.installPlanDigest,
      original:
        entry.original.kind === ManagedFileActualKind.Missing
          ? { kind: ManagedFileActualKind.Missing }
          : {
              kind: ManagedFileActualKind.RegularFile,
              digest: entry.original.digest,
            },
      metadata: {
        ownerPackage: entry.metadata.ownerPackage,
        profile: entry.metadata.profile,
        packageVersion: entry.metadata.packageVersion,
        template: entry.metadata.template,
        source: entry.metadata.source,
        sourceDigest: entry.metadata.sourceDigest,
      },
    }));
  return `${JSON.stringify({
    schemaVersion: MANAGED_FILE_MANIFEST_SCHEMA_VERSION,
    entries: persistedEntries,
  })}\n`;
}
