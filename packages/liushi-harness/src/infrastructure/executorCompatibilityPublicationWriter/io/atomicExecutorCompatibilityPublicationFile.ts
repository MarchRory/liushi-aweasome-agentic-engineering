import { randomUUID } from "node:crypto";
import { type FileHandle, link, lstat, mkdir, open, readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { ExecutorCompatibilityPublicationWriteDisposition } from "#application/ports/index.js";
import { HarnessError, HarnessErrorCode } from "#common/index.js";
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";

/** 原子创建不可变发布文件所需的规范字节与耐久性边界。 */
export interface CreateAtomicExecutorCompatibilityPublicationFileInput {
  /** 完整目标绝对路径。 */
  readonly outputFilePath: string;
  /** 已规范化且带单一末尾换行的 UTF-8 文本。 */
  readonly content: string;
  /** 平台相关的父目录耐久性实现。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}

/** 使用同目录完整临时文件与无覆盖原子链接发布不可变文件。 */
export async function createAtomicExecutorCompatibilityPublicationFile(
  input: CreateAtomicExecutorCompatibilityPublicationFileInput,
): Promise<ExecutorCompatibilityPublicationWriteDisposition> {
  await mkdir(dirname(input.outputFilePath), { recursive: true });
  const existing = await resolveExistingDisposition(input.outputFilePath, input.content);
  if (existing !== undefined) return existing;

  const temporaryFilePath = join(
    dirname(input.outputFilePath),
    `.liushi-publication-${process.pid}-${randomUUID()}.tmp`,
  );
  let temporaryHandle: FileHandle | undefined;
  let targetPublished = false;
  try {
    temporaryHandle = await open(temporaryFilePath, "wx", 0o600);
    await temporaryHandle.writeFile(input.content, "utf8");
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;

    try {
      await link(temporaryFilePath, input.outputFilePath);
      targetPublished = true;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
      await rm(temporaryFilePath, { force: true });
      return requireExistingDisposition(input.outputFilePath, input.content);
    }

    await rm(temporaryFilePath);
    await input.parentDirectoryDurability.syncParentDirectory(input.outputFilePath);
    await requireExistingDisposition(input.outputFilePath, input.content);
    return ExecutorCompatibilityPublicationWriteDisposition.Created;
  } catch (error) {
    await closeBestEffort(temporaryHandle);
    if (!targetPublished) await removeBestEffort(temporaryFilePath);
    if (targetPublished) {
      throw new HarnessError(
        HarnessErrorCode.ExecutorCompatibilityPublicationCommitOutcomeUnknown,
        "Executor compatibility publication started but its durable outcome is unknown.",
        { outputFilePath: input.outputFilePath },
        error,
      );
    }
    throw asPublicationIoError(error, input.outputFilePath);
  }
}

async function requireExistingDisposition(
  outputFilePath: string,
  expectedContent: string,
): Promise<ExecutorCompatibilityPublicationWriteDisposition> {
  const disposition = await resolveExistingDisposition(outputFilePath, expectedContent);
  if (disposition !== undefined) return disposition;
  throw new HarnessError(
    HarnessErrorCode.IoFailure,
    "Executor compatibility publication disappeared during verification.",
    { outputFilePath },
  );
}

async function resolveExistingDisposition(
  outputFilePath: string,
  expectedContent: string,
): Promise<ExecutorCompatibilityPublicationWriteDisposition | undefined> {
  try {
    const status = await lstat(outputFilePath);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw publicationConflict(outputFilePath, "unsupported_target_kind");
    }
    const existingContent = await readFile(outputFilePath, "utf8");
    if (existingContent !== expectedContent) {
      throw publicationConflict(outputFilePath, "content_mismatch");
    }
    return ExecutorCompatibilityPublicationWriteDisposition.IdempotentReuse;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    if (error instanceof HarnessError) throw error;
    throw asPublicationIoError(error, outputFilePath);
  }
}

function publicationConflict(outputFilePath: string, reason: string): HarnessError {
  return new HarnessError(
    HarnessErrorCode.PreconditionNotMet,
    "Executor compatibility publication output already exists with different content or kind.",
    { outputFilePath, reason },
  );
}

function asPublicationIoError(error: unknown, outputFilePath: string): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(
        HarnessErrorCode.IoFailure,
        "Unable to create executor compatibility publication output.",
        { outputFilePath, fileName: basename(outputFilePath) },
        error,
      );
}

async function closeBestEffort(handle: FileHandle | undefined): Promise<void> {
  try {
    await handle?.close();
  } catch {
    // 原始失败保留为主诊断，临时句柄清理仅作尽力而为。
  }
}

async function removeBestEffort(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true });
  } catch {
    // 发布目标尚未创建时，唯一临时文件残留不改变可重试语义。
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
