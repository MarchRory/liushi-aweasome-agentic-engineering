import { isAbsolute, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type {
  CodingTaskSessionActivationLease,
  CodingTaskSessionActivationLeaseHandle,
  CodingTaskSessionActivationLeaseLocator,
} from "#application/ports/codingTaskSessionActivationLease/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { parseCodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";
import type {
  ExclusiveFileLockHandle,
  FileLockManager,
} from "#infrastructure/persistence/fileEventStore/index.js";

import {
  CODING_TASK_SESSION_ACTIVATION_LEASE_LOCK_RETRY_ATTEMPTS,
  CODING_TASK_SESSION_ACTIVATION_LEASE_LOCK_RETRY_DELAY_MS,
} from "../constants/index.js";
import type { FileCodingTaskSessionActivationLeaseDependencies } from "../contracts/index.js";
import { resolveCodingTaskSessionActivationLeasePath } from "../path/index.js";

/** 使用独立 `.activation.lease.lock` 的跨进程 Session Activation Lease。 */
export class FileCodingTaskSessionActivationLease implements CodingTaskSessionActivationLease {
  private readonly storeRoot: string;
  private readonly lockManager: FileLockManager;

  public constructor(
    storeRoot: string,
    dependencies: FileCodingTaskSessionActivationLeaseDependencies,
  ) {
    if (!isAbsolute(storeRoot)) {
      throw new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Activation Lease Store Root 必须是绝对路径。",
      );
    }
    this.storeRoot = resolve(storeRoot);
    this.lockManager = dependencies.lockManager;
  }

  public async acquire(
    locator: CodingTaskSessionActivationLeaseLocator,
  ): Promise<Result<CodingTaskSessionActivationLeaseHandle, HarnessError>> {
    const workspaceId = parseWorkspaceId(String(locator?.workspaceId ?? ""));
    if (workspaceId.status === ResultStatus.Failure) return workspaceId;
    const sessionId = parseCodingTaskSessionId(String(locator?.sessionId ?? ""));
    if (sessionId.status === ResultStatus.Failure) return sessionId;
    const paths = resolveCodingTaskSessionActivationLeasePath(
      this.storeRoot,
      workspaceId.value,
      sessionId.value,
    );
    try {
      const lock = await acquireWithRetry(
        this.lockManager,
        paths.lockFile,
        paths.workspaceId,
        paths.sessionId,
      );
      return success({ release: () => releaseLock(lock) });
    } catch (error) {
      return failure(
        error instanceof HarnessError
          ? error
          : new HarnessError(HarnessErrorCode.IoFailure, "Activation Lease 获取失败。", {}, error),
      );
    }
  }
}

async function acquireWithRetry(
  lockManager: FileLockManager,
  lockFile: string,
  workspaceId: string,
  sessionId: string,
): Promise<ExclusiveFileLockHandle> {
  let lastError: unknown;
  for (
    let attempt = 0;
    attempt < CODING_TASK_SESSION_ACTIVATION_LEASE_LOCK_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await lockManager.acquire(lockFile, { workspaceId, taskId: sessionId });
    } catch (error) {
      lastError = error;
      if (!(error instanceof HarnessError) || error.code !== HarnessErrorCode.LockUnavailable)
        throw error;
      await delay(CODING_TASK_SESSION_ACTIVATION_LEASE_LOCK_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

async function releaseLock(lock: ExclusiveFileLockHandle): Promise<Result<void, HarnessError>> {
  try {
    await lock.release();
    return success(undefined);
  } catch (error) {
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Activation Lease 释放失败。", {}, error),
    );
  }
}
