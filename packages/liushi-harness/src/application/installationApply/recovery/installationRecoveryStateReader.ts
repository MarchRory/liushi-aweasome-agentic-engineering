import type { ManagedFileStateReader } from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import type {
  InstallationRevisionIntent,
  ManagedFileContentSnapshot,
  ManagedManifestSnapshot,
} from "#domain/installation/index.js";

import { writableInstallationFiles } from "../support/index.js";

/** 已持久化 Revision 对应的当前文件与 Manifest 现场。 */
export interface InstallationRecoveryState {
  /** 当前可写目标文件的完整现场快照。 */
  readonly files: readonly ManagedFileContentSnapshot[];
  /** 当前受管 Manifest 现场。 */
  readonly manifest: ManagedManifestSnapshot;
}

/** 读取恢复分类所需的受管文件和 Manifest 现场。 */
export async function readInstallationRecoveryState(
  intent: InstallationRevisionIntent,
  reader: ManagedFileStateReader,
): Promise<Result<InstallationRecoveryState, HarnessError>> {
  const files: ManagedFileContentSnapshot[] = [];
  for (const file of writableInstallationFiles(intent.plan)) {
    const snapshot = await reader.readContentSnapshot(intent.plan.root, file.path);
    if (snapshot.status === ResultStatus.Failure) return snapshot;
    files.push(snapshot.value);
  }
  const manifest = await reader.readManifest(intent.plan.root);
  return manifest.status === ResultStatus.Failure
    ? manifest
    : success({ files, manifest: manifest.value });
}
