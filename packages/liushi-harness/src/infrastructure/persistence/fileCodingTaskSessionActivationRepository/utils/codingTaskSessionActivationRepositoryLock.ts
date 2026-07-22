import { setTimeout as delay } from "node:timers/promises";

import { HarnessError, HarnessErrorCode } from "#common/index.js";
import type {
  ExclusiveFileLockHandle,
  FileLockManager,
} from "#infrastructure/persistence/fileEventStore/index.js";

import {
  CODING_TASK_SESSION_ACTIVATION_LOCK_RETRY_ATTEMPTS,
  CODING_TASK_SESSION_ACTIVATION_LOCK_RETRY_DELAY_MS,
} from "../constants/index.js";
import type { CodingTaskSessionActivationStorePaths } from "../contracts/index.js";

/** 按固定次数重试获取 Activation Record 的跨进程锁。 */
export async function acquireCodingTaskSessionActivationLockWithRetry(
  lockManager: FileLockManager,
  paths: CodingTaskSessionActivationStorePaths,
): Promise<ExclusiveFileLockHandle> {
  let lastError: unknown;
  for (
    let attempt = 0;
    attempt < CODING_TASK_SESSION_ACTIVATION_LOCK_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await lockManager.acquire(paths.lockFile, {
        workspaceId: paths.workspaceId,
        taskId: paths.sessionId,
      });
    } catch (error) {
      lastError = error;
      if (!(error instanceof HarnessError) || error.code !== HarnessErrorCode.LockUnavailable) {
        throw error;
      }
      await delay(CODING_TASK_SESSION_ACTIVATION_LOCK_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}
