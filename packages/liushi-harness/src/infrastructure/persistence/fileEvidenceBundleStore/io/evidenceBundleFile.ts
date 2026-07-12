import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import writeFileAtomic from "write-file-atomic";

import { HarnessError, HarnessErrorCode } from "#common/index.js";

import type { PersistedEvidenceBundle } from "../contracts/index.js";
import { parsePersistedEvidenceBundle } from "../schema/index.js";

/** 原子且 fsync 地写入完整 EvidenceBundle 文件。 */
export async function writeEvidenceBundleFile(
  filePath: string,
  record: PersistedEvidenceBundle,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    fsync: true,
    mode: 0o600,
  });
}

/** 读取并严格校验 EvidenceBundle 文件。 */
export async function readEvidenceBundleFile(filePath: string): Promise<PersistedEvidenceBundle> {
  try {
    return parsePersistedEvidenceBundle(JSON.parse(await readFile(filePath, "utf8")) as unknown);
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "EvidenceBundle 文件无效。",
      { recordFile: filePath },
      error,
    );
  }
}
