import { open } from "node:fs/promises";
import { dirname } from "node:path";

import { isPlatformEquivalentDirectorySyncError } from "../platform/index.mjs";

export async function syncParentDirectory(file) {
  try {
    const handle = await open(dirname(file), "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (isPlatformEquivalentDirectorySyncError(error)) return;
    throw error;
  }
}
