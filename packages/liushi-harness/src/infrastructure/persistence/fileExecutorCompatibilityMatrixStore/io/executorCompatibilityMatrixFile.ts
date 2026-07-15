import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import writeFileAtomic from "write-file-atomic";

import type { ExecutorCompatibilityMatrixRecord } from "#application/ports/index.js";
import { HarnessError, HarnessErrorCode } from "#common/index.js";

import { parseExecutorCompatibilityMatrixRecord } from "../schema/index.js";

/** 原子并带 fsync 写入完整 Matrix 与 Policy 记录。 */
export async function writeExecutorCompatibilityMatrixFile(
  filePath: string,
  record: ExecutorCompatibilityMatrixRecord,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    fsync: true,
    mode: 0o600,
  });
}

/** 读取并严格解析 Matrix Record；文件不存在时返回 undefined。 */
export async function readExecutorCompatibilityMatrixFile(
  filePath: string,
): Promise<ExecutorCompatibilityMatrixRecord | undefined> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    throw new HarnessError(
      HarnessErrorCode.IoFailure,
      "无法读取 Executor Compatibility Matrix 文件。",
      { recordFile: filePath },
      error,
    );
  }
  try {
    return parseExecutorCompatibilityMatrixRecord(
      JSON.parse(content) as unknown,
      HarnessErrorCode.CorruptStore,
    );
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Executor Compatibility Matrix 文件不是有效 JSON。",
      { recordFile: filePath },
      error,
    );
  }
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
