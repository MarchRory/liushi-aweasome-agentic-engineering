import { open } from "node:fs/promises";
import { dirname } from "node:path";

import { ParentDirectorySyncStatus } from "#application/index.js";

import type { ParentDirectoryDurability, ParentDirectorySyncOutcome } from "../contracts/index.js";

/** 使用 Node FileHandle.sync 刷新父目录的目录耐久性 Adapter。 */
export class FileParentDirectoryDurability implements ParentDirectoryDurability {
  /** Linux/macOS 支持目录 fsync；Windows 不支持时返回 best-effort。 */
  public async syncParentDirectory(filePath: string): Promise<ParentDirectorySyncOutcome> {
    try {
      const handle = await open(dirname(filePath), "r");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      return { status: ParentDirectorySyncStatus.Synced };
    } catch (error) {
      if (isBestEffortDirectorySyncError(error)) {
        return {
          status: ParentDirectorySyncStatus.BestEffort,
          reason: String(error.code),
        };
      }
      throw error;
    }
  }
}

function isBestEffortDirectorySyncError(error: unknown): error is NodeJS.ErrnoException {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  return ["EISDIR", "EPERM", "EINVAL", "ENOTSUP", "EACCES"].includes(
    String((error as NodeJS.ErrnoException).code),
  );
}
