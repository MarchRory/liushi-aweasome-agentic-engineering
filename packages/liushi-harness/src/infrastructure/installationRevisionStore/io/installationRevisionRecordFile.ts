import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname } from "node:path";

import writeFileAtomic from "write-file-atomic";

import { HarnessError, HarnessErrorCode } from "#common/index.js";
import type { InstallationRevisionRecord } from "#domain/installation/index.js";

/** 列出 records 目录的直接成员；目录不存在等价于尚无记录。 */
export async function listInstallationRevisionRecordFileNames(
  recordsDirectory: string,
): Promise<readonly string[]> {
  try {
    return (await readdir(recordsDirectory, { withFileTypes: true })).map((entry) => entry.name);
  } catch (error) {
    if (isMissingPathError(error)) return [];
    throw new HarnessError(
      HarnessErrorCode.IoFailure,
      "Unable to list Installation Revision records.",
      { recordsDirectory },
      error,
    );
  }
}

/** 读取权威记录 JSON；扫描后消失的文件返回 undefined。 */
export async function readInstallationRevisionRecordFile(filePath: string): Promise<unknown> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    throw new HarnessError(
      HarnessErrorCode.IoFailure,
      "Unable to read Installation Revision record.",
      { recordFile: filePath },
      error,
    );
  }
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Installation Revision record is not valid JSON.",
      { recordFile: filePath },
      error,
    );
  }
}

/** 使用 write-file-atomic 完整替换并 fsync 单一权威记录。 */
export async function writeInstallationRevisionRecordFile(
  filePath: string,
  record: InstallationRevisionRecord,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    fsync: true,
    mode: 0o600,
  });
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
