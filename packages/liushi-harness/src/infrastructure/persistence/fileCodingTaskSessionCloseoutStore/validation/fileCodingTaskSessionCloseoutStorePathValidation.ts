import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { samePathIdentity } from "#infrastructure/system/platformCompatibility/index.js";

import type { CodingTaskSessionCloseoutStorePaths } from "../contracts/index.js";

/** 确保 Store Root 与 Session 目录均为真实普通目录，并按需创建缺失层级。 */
export async function ensureCodingTaskSessionCloseoutStorePath(
  paths: CodingTaskSessionCloseoutStorePaths,
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
              new HarnessError(
                HarnessErrorCode.IoFailure,
                "Closeout Store 目录创建失败。",
                {},
                mkdirError,
              ),
            );
          }
        }
        status = await lstat(current);
      }
      if (!status.isDirectory() || status.isSymbolicLink()) return failure(unsafePath());
    }
    return success(true);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return success(false);
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Closeout Store 路径不可用。", {}, error),
    );
  }
}

/** 检查 State 目标是否为已存在的普通文件。 */
export async function isCodingTaskSessionCloseoutStatePresent(
  stateFile: string,
): Promise<Result<boolean, HarnessError>> {
  try {
    const status = await lstat(stateFile);
    return status.isFile() && !status.isSymbolicLink()
      ? success(true)
      : failure(new HarnessError(HarnessErrorCode.CorruptStore, "Closeout State 文件类型无效。"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return success(false);
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Closeout State 路径读取失败。", {}, error),
    );
  }
}

function unsafePath(): HarnessError {
  return new HarnessError(
    HarnessErrorCode.OperationForbidden,
    "Closeout Store 路径包含不受支持的链接或目录。",
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
