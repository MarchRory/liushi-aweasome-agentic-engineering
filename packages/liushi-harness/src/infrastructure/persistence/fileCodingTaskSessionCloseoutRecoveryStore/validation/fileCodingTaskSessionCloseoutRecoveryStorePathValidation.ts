import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  parseCodingTaskSessionId,
  type CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";
import { samePathIdentity } from "#infrastructure/system/platformCompatibility/index.js";

import type { CodingTaskSessionCloseoutRecoveryStateLocator } from "#application/ports/codingTaskSessionCloseoutRecoveryStateStore/index.js";
import type { CodingTaskSessionCloseoutRecoveryStorePaths } from "../contracts/index.js";

/** 严格解析 Recovery State 的 Workspace/Session 定位信息。 */
export function parseCodingTaskSessionCloseoutRecoveryStateLocator(
  locator: CodingTaskSessionCloseoutRecoveryStateLocator,
): Result<
  { readonly workspaceId: WorkspaceId; readonly sessionId: CodingTaskSessionId },
  HarnessError
> {
  if (typeof locator?.workspaceId !== "string" || typeof locator?.sessionId !== "string") {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Recovery State locator 无效。"),
    );
  }
  const workspaceId = parseWorkspaceId(locator.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "workspaceId 无效。"));
  }
  const sessionId = parseCodingTaskSessionId(locator.sessionId);
  if (sessionId.status === ResultStatus.Failure) {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "sessionId 无效。"));
  }
  return success({ workspaceId: workspaceId.value, sessionId: sessionId.value });
}

/** 校验 Store Root 与 Session 祖先目录，拒绝遍历和符号链接。 */
export async function ensureCodingTaskSessionCloseoutRecoveryStorePath(
  paths: CodingTaskSessionCloseoutRecoveryStorePaths,
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
        if (!isNodeError(error) || error.code !== "ENOENT") {
          return failure(
            new HarnessError(
              HarnessErrorCode.IoFailure,
              "Closeout Recovery Store 祖先目录读取失败。",
              { directoryPath: current },
              error,
            ),
          );
        }
        if (!createMissing) return success(false);
        try {
          await mkdir(current);
        } catch (mkdirError) {
          if (!isNodeError(mkdirError) || mkdirError.code !== "EEXIST") {
            return failure(
              new HarnessError(
                HarnessErrorCode.IoFailure,
                "Closeout Recovery Store 目录创建失败。",
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
      new HarnessError(
        HarnessErrorCode.IoFailure,
        "Closeout Recovery Store 路径不可用。",
        {},
        error,
      ),
    );
  }
}

/** 判断 Recovery State 文件是否为已存在的普通非符号链接文件。 */
export async function isCodingTaskSessionCloseoutRecoveryStatePresent(
  stateFile: string,
): Promise<Result<boolean, HarnessError>> {
  try {
    const status = await lstat(stateFile);
    return status.isFile() && !status.isSymbolicLink()
      ? success(true)
      : failure(new HarnessError(HarnessErrorCode.CorruptStore, "Recovery State 文件类型无效。"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return success(false);
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Recovery State 文件路径不可用。", {}, error),
    );
  }
}

function unsafePath(): HarnessError {
  return new HarnessError(
    HarnessErrorCode.OperationForbidden,
    "Closeout Recovery Store 路径包含不受支持的链接或目录。",
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
