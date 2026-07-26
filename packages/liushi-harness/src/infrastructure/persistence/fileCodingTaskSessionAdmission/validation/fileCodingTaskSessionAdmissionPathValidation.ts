import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { samePathIdentity } from "#infrastructure/system/platformCompatibility/index.js";

import type { CodingTaskSessionAdmissionStorePaths } from "../contracts/index.js";

/** 确保 Admission 目录在可信 storeRoot 下，且每一级均为真实目录。 */
export async function ensureCodingTaskSessionAdmissionStorePath(
  paths: CodingTaskSessionAdmissionStorePaths,
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
                "Admission Store 目录创建失败",
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
      new HarnessError(HarnessErrorCode.IoFailure, "Admission Store 路径不可用", {}, error),
    );
  }
}

/** 检查 admission.json 是否为已存在的普通文件。 */
export async function isCodingTaskSessionAdmissionStatePresent(
  stateFile: string,
): Promise<Result<boolean, HarnessError>> {
  try {
    const status = await lstat(stateFile);
    return status.isFile() && !status.isSymbolicLink()
      ? success(true)
      : failure(new HarnessError(HarnessErrorCode.CorruptStore, "Admission State 文件类型无效"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return success(false);
    return failure(
      new HarnessError(HarnessErrorCode.CorruptStore, "Admission State 文件路径不可用", {}, error),
    );
  }
}

function unsafePath(): HarnessError {
  return new HarnessError(
    HarnessErrorCode.OperationForbidden,
    "Admission Store 路径包含不受支持的链接或目录",
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
