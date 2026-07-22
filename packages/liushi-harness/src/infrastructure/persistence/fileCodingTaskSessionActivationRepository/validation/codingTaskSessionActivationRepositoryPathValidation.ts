import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { samePathIdentity } from "#infrastructure/system/platformCompatibility/index.js";

import type { CodingTaskSessionActivationStorePaths } from "../contracts/index.js";

/** 确保 Activation Store 路径位于真实目录中，并按需创建缺失目录。 */
export async function ensureCodingTaskSessionActivationStorePath(
  paths: CodingTaskSessionActivationStorePaths,
  createMissing: boolean,
): Promise<Result<boolean, HarnessError>> {
  try {
    const root = resolve(paths.workspaceDirectory, "..", "..");
    const rootStatus = await lstat(root);
    if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) return failure(unsafePath());
    const realRoot = await realpath(root);
    if (!samePathIdentity(realRoot, root)) return failure(unsafePath());

    const relativePath = relative(root, paths.sessionDirectory);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) return failure(unsafePath());
    let current = root;
    for (const part of relativePath.split(sep)) {
      current = resolve(current, part);
      let status;
      try {
        status = await lstat(current);
      } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") return failure(unsafePath());
        if (!createMissing) return success(false);
        try {
          await mkdir(current);
        } catch (mkdirError) {
          if (!isNodeError(mkdirError) || mkdirError.code !== "EEXIST") {
            return failure(
              new HarnessError(HarnessErrorCode.IoFailure, "Activation Store 目录创建失败。"),
            );
          }
        }
        status = await lstat(current);
      }
      if (!status.isDirectory() || status.isSymbolicLink()) return failure(unsafePath());
    }
    return success(true);
  } catch {
    return failure(new HarnessError(HarnessErrorCode.IoFailure, "Activation Store 路径不可用。"));
  }
}

/** 检查 Activation Record 文件是否存在。 */
export async function isCodingTaskSessionActivationRecordPresent(
  filePath: string,
): Promise<Result<boolean, HarnessError>> {
  try {
    await lstat(filePath);
    return success(true);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return success(false);
    return failure(
      new HarnessError(HarnessErrorCode.CorruptStore, "Activation Record 路径不可用。"),
    );
  }
}

function unsafePath(): HarnessError {
  return new HarnessError(
    HarnessErrorCode.OperationForbidden,
    "Activation Store 路径包含不受支持的链接或目录。",
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
