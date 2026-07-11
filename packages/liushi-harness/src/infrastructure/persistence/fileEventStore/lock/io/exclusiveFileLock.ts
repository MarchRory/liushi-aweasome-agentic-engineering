import { type FileHandle, mkdir, open, rm } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";

import { HarnessError, HarnessErrorCode } from "#common/index.js";

import { TASK_LOCK_SCHEMA_VERSION } from "../../constants/index.js";
import type { ExclusiveFileLockHandle, TaskLockContext } from "../contracts/index.js";

/** 使用 `wx` 文件创建语义获得跨进程排他 Lock。 */
export async function acquireExclusiveFileLock(
  lockFile: string,
  context: TaskLockContext,
): Promise<ExclusiveFileLockHandle> {
  await mkdir(dirname(lockFile), { recursive: true });

  let handle: FileHandle | undefined;
  try {
    handle = await open(lockFile, "wx");
    const acquiredAt = new Date().toISOString();
    await handle.writeFile(
      `${JSON.stringify({
        schemaVersion: TASK_LOCK_SCHEMA_VERSION,
        processId: process.pid,
        host: hostname(),
        startedAt: acquiredAt,
        heartbeatAt: acquiredAt,
        workspaceId: context.workspaceId,
        taskId: context.taskId,
      })}\n`,
      "utf8",
    );
    await handle.sync();
  } catch (error) {
    const cleanupError = await cleanFailedAcquisition(handle, lockFile);
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new HarnessError(
        HarnessErrorCode.LockUnavailable,
        "Task lock is already held or requires explicit recovery.",
        { lockFile },
        error,
      );
    }
    throw new HarnessError(
      HarnessErrorCode.IoFailure,
      "Unable to acquire task lock.",
      { lockFile },
      cleanupError === undefined ? error : new AggregateError([error, cleanupError]),
    );
  }

  if (handle === undefined) {
    throw new HarnessError(HarnessErrorCode.IoFailure, "Task lock handle was not created.", {
      lockFile,
    });
  }

  let released = false;
  return {
    async release(): Promise<void> {
      if (released) {
        return;
      }
      released = true;
      await handle.close();
      await rm(lockFile);
    },
  };
}

async function cleanFailedAcquisition(
  handle: FileHandle | undefined,
  lockFile: string,
): Promise<Error | undefined> {
  if (handle === undefined) {
    return undefined;
  }
  try {
    await handle.close();
    await rm(lockFile);
    return undefined;
  } catch (error) {
    return error instanceof Error
      ? error
      : new Error("Unable to clean failed task lock acquisition.", { cause: error });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
