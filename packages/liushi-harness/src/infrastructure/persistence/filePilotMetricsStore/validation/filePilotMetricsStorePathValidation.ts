import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { samePathIdentity } from "#infrastructure/system/platformCompatibility/index.js";

import type { FilePilotMetricsStorePaths } from "../contracts/index.js";

/** 校验 Runtime Store 根目录并按需创建固定的 Pilot Metrics 目录。 */
export async function ensureFilePilotMetricsStorePath(
  paths: FilePilotMetricsStorePaths,
  createMissing: boolean,
): Promise<Result<boolean, HarnessError>> {
  try {
    const root = resolve(paths.storeRoot);
    let rootStatus;
    try {
      rootStatus = await lstat(root);
    } catch (error) {
      if (!createMissing && isNodeError(error) && error.code === "ENOENT") {
        return success(false);
      }
      throw error;
    }
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
              new HarnessError(HarnessErrorCode.IoFailure, "Pilot Metrics 目录创建失败"),
            );
          }
        }
        status = await lstat(current);
      }
      if (!status.isDirectory() || status.isSymbolicLink()) return failure(unsafePath());
    }
    return success(true);
  } catch (error) {
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Pilot Metrics Store 路径不可用", {}, error),
    );
  }
}

function unsafePath(): HarnessError {
  return new HarnessError(HarnessErrorCode.OperationForbidden, "Pilot Metrics Store 路径不安全");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
