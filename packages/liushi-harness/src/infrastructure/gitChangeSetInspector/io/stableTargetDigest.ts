import type { BigIntStats } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, type FileHandle } from "node:fs/promises";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import {
  resolveSafeRepositoryTarget,
  resolveStableReadOpenFlags,
} from "#infrastructure/system/platformCompatibility/index.js";

const READ_CHUNK_SIZE = 64 * 1024;
const READ_FLAGS = resolveStableReadOpenFlags();

/** 读取已删除目标的稳定空状态，并拒绝目标重新出现或路径链漂移。 */
export async function readDeletedTargetDigest(
  root: string,
  path: string,
): Promise<Result<null, HarnessError>> {
  const target = await resolveTarget(root, path);
  if (target.status === ResultStatus.Failure) return target;

  try {
    await lstat(target.value, { bigint: true });
    return stableFailure(path, "deleted_target_present");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      return stableFailure(path, "deleted_target_unavailable");
    }
  }

  const revalidatedTarget = await resolveTarget(root, path);
  if (revalidatedTarget.status === ResultStatus.Failure) return revalidatedTarget;
  if (revalidatedTarget.value !== target.value) {
    return stableFailure(path, "target_path_drifted");
  }

  try {
    await lstat(revalidatedTarget.value, { bigint: true });
    return stableFailure(path, "deleted_target_drifted");
  } catch (error) {
    return isNodeError(error) && error.code === "ENOENT"
      ? success(null)
      : stableFailure(path, "deleted_target_unavailable");
  }
}

/** 打开普通文件并以稳定元数据边界计算原始字节 SHA-256。 */
export async function readStableTargetDigest(
  root: string,
  path: string,
): Promise<Result<ContentDigest, HarnessError>> {
  const target = await resolveTarget(root, path);
  if (target.status === ResultStatus.Failure) return target;

  let handle: FileHandle | undefined;
  try {
    const beforePathStat = await lstat(target.value, { bigint: true });
    if (beforePathStat.isSymbolicLink() || !beforePathStat.isFile()) {
      return stableFailure(path, "target_kind_unsupported");
    }

    const revalidatedTarget = await resolveTarget(root, path);
    if (revalidatedTarget.status === ResultStatus.Failure) return revalidatedTarget;
    if (revalidatedTarget.value !== target.value) {
      return stableFailure(path, "target_path_drifted");
    }

    handle = await open(target.value, READ_FLAGS);
    const beforeHandleStat = await handle.stat({ bigint: true });
    if (
      beforeHandleStat.isSymbolicLink() ||
      !beforeHandleStat.isFile() ||
      !sameFileStat(beforePathStat, beforeHandleStat)
    ) {
      return stableFailure(path, "target_entity_drifted");
    }

    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(READ_CHUNK_SIZE);
    for (;;) {
      const readResult = await handle.read(buffer, 0, buffer.length, null);
      if (readResult.bytesRead === 0) break;
      hash.update(buffer.subarray(0, readResult.bytesRead));
    }

    const afterPathStat = await lstat(target.value, { bigint: true });
    const afterHandleStat = await handle.stat({ bigint: true });
    const afterResolvedTarget = await resolveTarget(root, path);
    if (afterResolvedTarget.status === ResultStatus.Failure) return afterResolvedTarget;
    if (afterResolvedTarget.value !== target.value) {
      return stableFailure(path, "target_path_drifted");
    }
    if (
      !sameFileStat(beforePathStat, afterPathStat) ||
      !sameFileStat(beforeHandleStat, afterHandleStat) ||
      !sameFileStat(afterPathStat, afterHandleStat)
    ) {
      return stableFailure(path, "target_entity_drifted");
    }

    const parsed = parseContentDigest(`sha256:${hash.digest("hex")}`);
    return parsed.status === ResultStatus.Success
      ? parsed
      : stableFailure(path, "target_digest_invalid");
  } catch (error) {
    return stableFailure(
      path,
      isNodeError(error) && error.code === "ENOENT" ? "target_drifted" : "target_read_failed",
    );
  } finally {
    if (handle !== undefined) await handle.close().catch(() => undefined);
  }
}

async function resolveTarget(root: string, path: string): Promise<Result<string, HarnessError>> {
  try {
    const target = await resolveSafeRepositoryTarget(root, path);
    return target.status === ResultStatus.Success
      ? target
      : stableFailure(path, "target_path_unavailable");
  } catch {
    return stableFailure(path, "target_path_unavailable");
  }
}

function sameFileStat(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs &&
    left.mode === right.mode
  );
}

function stableFailure(path: string, reason: string): Result<never, HarnessError> {
  const details = isSafeRelativePath(path) ? { path, reason } : { reason };
  return failure(
    new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Git ChangeSet 目标无法形成稳定摘要。",
      details,
    ),
  );
}

function isSafeRelativePath(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:/u.test(value) &&
    !value.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
