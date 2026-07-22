import type { BigIntStats } from "node:fs";
import { type FileHandle, lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { samePathIdentity } from "#infrastructure/system/platformCompatibility/index.js";

import type { StrictJsonFileReadInput } from "../contracts/index.js";
import { parseStrictUtf8Json } from "../parser/index.js";

/** 使用路径与句柄的多次 bigint stat 复验检测读取期间实体漂移。 */
export async function readStrictJsonFile(
  input: StrictJsonFileReadInput,
): Promise<Result<unknown, HarnessError>> {
  if (
    !isAbsolute(input.filePath) ||
    !Number.isSafeInteger(input.expectedByteLength) ||
    input.expectedByteLength <= 0
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "严格 JSON Reader 需要绝对路径和精确正整数字节数。",
      ),
    );
  }
  let handle: FileHandle | undefined;
  try {
    const resolvedPath = resolve(input.filePath);
    const realFilePath = await realpath(resolvedPath);
    if (!samePathIdentity(realFilePath, resolvedPath)) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "严格 JSON Reader 不接受经过符号链接或目录联接的路径。",
        ),
      );
    }
    const beforePath = await lstat(resolvedPath, { bigint: true });
    const unsupported = requireRegularPath(beforePath);
    if (unsupported !== undefined) return unsupported;

    handle = await open(resolvedPath, "r");
    const openedHandle = await handle.stat({ bigint: true });
    const afterOpenPath = await lstat(resolvedPath, { bigint: true });
    const openedIdentity = requireStableFileIdentity(
      beforePath,
      openedHandle,
      afterOpenPath,
      input.expectedByteLength,
    );
    if (openedIdentity !== undefined) return openedIdentity;

    const bytes = await handle.readFile();
    const afterReadHandle = await handle.stat({ bigint: true });
    const afterReadPath = await lstat(resolvedPath, { bigint: true });
    const readIdentity = requireStableFileIdentity(
      openedHandle,
      afterReadHandle,
      afterReadPath,
      input.expectedByteLength,
    );
    if (readIdentity !== undefined) return readIdentity;
    if (bytes.byteLength !== input.expectedByteLength) {
      return fileDrift("byte_length_changed");
    }

    const parsed = parseStrictUtf8Json(bytes, input.canonicalPolicy);
    return parsed.status === ResultStatus.Failure ? parsed : success(parsed.value);
  } catch (error) {
    return failure(
      error instanceof HarnessError
        ? error
        : new HarnessError(
            HarnessErrorCode.IoFailure,
            "读取严格 JSON 文件失败。",
            { filePath: input.filePath },
            error,
          ),
    );
  } finally {
    await closeBestEffort(handle);
  }
}

function requireRegularPath(status: BigIntStats): Result<never, HarnessError> | undefined {
  return !status.isFile() || status.isSymbolicLink()
    ? failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "严格 JSON Reader 只接受非符号链接普通文件。",
        ),
      )
    : undefined;
}

function requireStableFileIdentity(
  expected: BigIntStats,
  handleStatus: BigIntStats,
  pathStatus: BigIntStats,
  expectedByteLength: number,
): Result<never, HarnessError> | undefined {
  const unsupported = requireRegularPath(pathStatus);
  if (unsupported !== undefined) return unsupported;
  if (
    !handleStatus.isFile() ||
    handleStatus.size !== BigInt(expectedByteLength) ||
    !sameFileIdentity(expected, handleStatus) ||
    !sameFileIdentity(handleStatus, pathStatus)
  ) {
    return fileDrift("file_identity_changed");
  }
  return undefined;
}

function sameFileIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size;
}

function fileDrift(reason: string): Result<never, HarnessError> {
  return failure(
    new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "JSON 文件在读取期间发生实体或字节漂移。",
      { reason },
    ),
  );
}

async function closeBestEffort(handle: FileHandle | undefined): Promise<void> {
  try {
    await handle?.close();
  } catch {
    // 关闭失败不覆盖主读取结果。
  }
}
