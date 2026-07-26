import { randomUUID } from "node:crypto";
import type { BigIntStats } from "node:fs";
import { type FileHandle, link, lstat, mkdir, open, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { isDurableParentDirectorySyncStatus } from "#application/ports/index.js";
import { HarnessError, HarnessErrorCode } from "#common/index.js";

import type { CreateOnlyImmutableFileInput } from "../contracts/index.js";
import {
  ImmutableFileParentDirectoryPolicy,
  ImmutableFileWriteDisposition,
} from "../enums/index.js";

/** 使用 wx 临时文件、fsync 与 hard-link 实现不可变文件发布。 */
export async function createOnlyImmutableFile(
  input: CreateOnlyImmutableFileInput,
): Promise<ImmutableFileWriteDisposition> {
  if (input.parentDirectoryPolicy === ImmutableFileParentDirectoryPolicy.CreateRecursively) {
    await mkdir(dirname(input.outputFilePath), { recursive: true });
  }
  const existing = await resolveExisting(input);
  if (existing !== undefined) return existing;

  const temporaryFilePath = join(
    dirname(input.outputFilePath),
    `.liushi-immutable-${process.pid}-${randomUUID()}.tmp`,
  );
  let temporaryHandle: FileHandle | undefined;
  let targetPublished = false;
  try {
    temporaryHandle = await open(temporaryFilePath, "wx", 0o600);
    await temporaryHandle.writeFile(input.content);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    try {
      await link(temporaryFilePath, input.outputFilePath);
      targetPublished = true;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
      await rm(temporaryFilePath, { force: true });
      return requireExisting(input);
    }
    await rm(temporaryFilePath);
    const directorySync = await input.parentDirectoryDurability.syncParentDirectory(
      input.outputFilePath,
    );
    if (!isDurableParentDirectorySyncStatus(directorySync.status)) {
      throw new HarnessError(
        input.commitOutcomeUnknownCode,
        `${input.artifactName} 父目录未达到受支持的耐久性。`,
        {
          outputFilePath: input.outputFilePath,
          parentDirectorySyncStatus: directorySync.status,
          reason: directorySync.reason ?? "not_reported",
        },
      );
    }
    await requireExisting(input);
    return ImmutableFileWriteDisposition.Created;
  } catch (error) {
    await closeBestEffort(temporaryHandle);
    if (!targetPublished) await removeBestEffort(temporaryFilePath);
    if (targetPublished) {
      if (error instanceof HarnessError && error.code === input.commitOutcomeUnknownCode) {
        throw error;
      }
      throw new HarnessError(
        input.commitOutcomeUnknownCode,
        `${input.artifactName} commit outcome is unknown.`,
        { outputFilePath: input.outputFilePath },
        error,
      );
    }
    throw asIoError(error, input);
  }
}

async function requireExisting(
  input: CreateOnlyImmutableFileInput,
): Promise<ImmutableFileWriteDisposition> {
  const disposition = await resolveExisting(input);
  if (disposition !== undefined) return disposition;
  throw new HarnessError(
    HarnessErrorCode.IoFailure,
    `${input.artifactName} disappeared during verification.`,
    { outputFilePath: input.outputFilePath },
  );
}

async function resolveExisting(
  input: CreateOnlyImmutableFileInput,
): Promise<ImmutableFileWriteDisposition | undefined> {
  let handle: FileHandle | undefined;
  try {
    let beforePath: BigIntStats;
    try {
      beforePath = await lstat(input.outputFilePath, { bigint: true });
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return undefined;
      throw error;
    }
    requireSupportedTarget(beforePath, input);
    handle = await open(input.outputFilePath, "r");
    const openedHandle = await handle.stat({ bigint: true });
    const afterOpenPath = await lstat(input.outputFilePath, { bigint: true });
    requireStableIdentity(beforePath, openedHandle, afterOpenPath, input);
    const existing = await handle.readFile();
    const afterReadHandle = await handle.stat({ bigint: true });
    const afterReadPath = await lstat(input.outputFilePath, { bigint: true });
    requireStableIdentity(openedHandle, afterReadHandle, afterReadPath, input);
    if (!existing.equals(input.content)) throw conflict(input, "content_mismatch");
    return ImmutableFileWriteDisposition.IdempotentReuse;
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    throw asIoError(error, input);
  } finally {
    await closeBestEffort(handle);
  }
}

function requireSupportedTarget(status: BigIntStats, input: CreateOnlyImmutableFileInput): void {
  if (!status.isFile() || status.isSymbolicLink()) {
    throw conflict(input, "unsupported_target_kind");
  }
}

function requireStableIdentity(
  expected: BigIntStats,
  handleStatus: BigIntStats,
  pathStatus: BigIntStats,
  input: CreateOnlyImmutableFileInput,
): void {
  requireSupportedTarget(pathStatus, input);
  if (
    !handleStatus.isFile() ||
    !sameFileIdentity(expected, handleStatus) ||
    !sameFileIdentity(handleStatus, pathStatus)
  ) {
    throw conflict(input, "target_identity_changed");
  }
}

function sameFileIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size;
}

function conflict(input: CreateOnlyImmutableFileInput, reason: string): HarnessError {
  return new HarnessError(
    input.conflictErrorCode,
    `${input.artifactName} output already exists with different content or kind.`,
    { outputFilePath: input.outputFilePath, reason },
  );
}

function asIoError(error: unknown, input: CreateOnlyImmutableFileInput): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(
        HarnessErrorCode.IoFailure,
        `Unable to create ${input.artifactName} output.`,
        { outputFilePath: input.outputFilePath, fileName: basename(input.outputFilePath) },
        error,
      );
}

async function closeBestEffort(handle: FileHandle | undefined): Promise<void> {
  try {
    await handle?.close();
  } catch {
    // 清理失败不覆盖主错误。
  }
}

async function removeBestEffort(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true });
  } catch {
    // 临时文件清理仅作尽力而为。
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
