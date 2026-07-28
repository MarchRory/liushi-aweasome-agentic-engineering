import { randomUUID } from "node:crypto";
import { link, open, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

import { syncParentDirectory } from "../durability/index.mjs";

export async function createOnlyImmutableFile(file, content) {
  const temporaryFile = join(dirname(file), `.liushi-immutable-${process.pid}-${randomUUID()}.tmp`);
  let handle;
  let targetPublished = false;
  try {
    handle = await open(temporaryFile, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(temporaryFile, file);
    targetPublished = true;
    await rm(temporaryFile);
    await syncParentDirectory(file);
  } catch (error) {
    const cleanupErrors = await cleanupTemporaryFile(handle, temporaryFile);
    if (targetPublished) {
      const durabilityError = new Error("不可变文件已发布，但父目录耐久性结果无法确认。", {
        cause: error,
      });
      durabilityError.commitOutcomeUnknown = true;
      if (cleanupErrors.length === 0) throw durabilityError;
      throw new AggregateError(
        [durabilityError, ...cleanupErrors],
        "不可变文件发布结果与清理结果均无法确认。",
        { cause: error },
      );
    }
    if (cleanupErrors.length === 0) throw error;
    throw new AggregateError([error, ...cleanupErrors], "不可变文件发布与清理均失败。", {
      cause: error,
    });
  }
}

async function cleanupTemporaryFile(handle, temporaryFile) {
  const errors = [];
  if (handle !== undefined) {
    try {
      await handle.close();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await rm(temporaryFile, { force: true });
  } catch (error) {
    errors.push(error);
  }
  return errors;
}
