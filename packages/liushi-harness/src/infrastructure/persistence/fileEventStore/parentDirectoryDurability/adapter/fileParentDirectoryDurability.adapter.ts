import { open } from "node:fs/promises";
import { dirname } from "node:path";

import { ParentDirectorySyncStatus } from "#application/index.js";
import {
  isBestEffortDirectorySyncError,
  isPlatformEquivalentDirectorySyncError,
} from "#infrastructure/system/index.js";

import type { ParentDirectoryDurability, ParentDirectorySyncOutcome } from "../contracts/index.js";

/** 使用 Node FileHandle.sync 刷新父目录的目录耐久性 Adapter。 */
export class FileParentDirectoryDurability implements ParentDirectoryDurability {
  /** 刷新父目录，并把平台精确认可的错误映射为等价耐久状态。 */
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
      if (isPlatformEquivalentDirectorySyncError(error)) {
        return {
          status: ParentDirectorySyncStatus.PlatformEquivalent,
          reason: `${String(error.code)}:${String(error.syscall)}`,
        };
      }
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
