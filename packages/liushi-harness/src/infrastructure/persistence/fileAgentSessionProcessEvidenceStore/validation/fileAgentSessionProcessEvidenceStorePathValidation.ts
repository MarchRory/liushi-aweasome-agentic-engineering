import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { samePathIdentity } from "#infrastructure/system/platformCompatibility/index.js";

import type { AgentSessionProcessEvidenceStorePaths } from "../contracts/index.js";

/** 验证真实目录边界，并按需逐级创建进程证据目录。 */
export async function ensureAgentSessionProcessEvidenceStorePath(
  paths: AgentSessionProcessEvidenceStorePaths,
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
            return failure(new HarnessError(HarnessErrorCode.IoFailure, "进程证据目录创建失败。"));
          }
        }
        status = await lstat(current);
      }
      if (!status.isDirectory() || status.isSymbolicLink()) return failure(unsafePath());
    }
    return success(true);
  } catch (error) {
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "进程证据 Store 路径不可用。", {}, error),
    );
  }
}

function unsafePath(): HarnessError {
  return new HarnessError(
    HarnessErrorCode.OperationForbidden,
    "进程证据 Store 路径包含不受支持的链接或目录。",
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
