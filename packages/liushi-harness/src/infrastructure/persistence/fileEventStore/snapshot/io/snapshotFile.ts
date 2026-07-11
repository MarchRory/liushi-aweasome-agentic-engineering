import { lstat, readFile } from "node:fs/promises";

import writeFileAtomic from "write-file-atomic";

import { HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";
import type { PersistedTaskSnapshot } from "#domain/taskRun/index.js";

import { JSON_LINE_SEPARATOR, MAX_TASK_SNAPSHOT_BYTES } from "../../constants/index.js";
import { parsePersistedTaskSnapshot } from "../../schema/index.js";

/** 使用 fsync 和原子 Rename 写入 Task Snapshot。 */
export async function writeTaskSnapshot(
  snapshotFile: string,
  snapshot: PersistedTaskSnapshot,
): Promise<void> {
  await writeFileAtomic(snapshotFile, `${JSON.stringify(snapshot)}${JSON_LINE_SEPARATOR}`, {
    encoding: "utf8",
    fsync: true,
    mode: 0o600,
  });
}

/** 读取并完成 JSON 与 Schema 校验。 */
export async function readTaskSnapshot(snapshotFile: string): Promise<PersistedTaskSnapshot> {
  const metadata = await lstat(snapshotFile);
  if (!metadata.isFile() || metadata.size > MAX_TASK_SNAPSHOT_BYTES) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Task snapshot is not a regular file or exceeds the supported size limit.",
      { sizeBytes: String(metadata.size), snapshotFile },
    );
  }
  let input: unknown;
  try {
    input = JSON.parse(await readFile(snapshotFile, "utf8"));
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Task snapshot is not valid JSON.",
      { snapshotFile },
      error,
    );
  }

  const parsed = parsePersistedTaskSnapshot(input);
  if (parsed.status === ResultStatus.Failure) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      parsed.error.message,
      { ...parsed.error.details, snapshotFile },
      parsed.error,
    );
  }
  return parsed.value;
}
