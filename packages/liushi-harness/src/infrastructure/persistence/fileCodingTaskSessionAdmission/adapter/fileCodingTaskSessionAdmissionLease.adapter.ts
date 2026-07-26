import { isAbsolute, resolve } from "node:path";

import type {
  CodingTaskSessionAdmissionLease,
  CodingTaskSessionAdmissionLeaseHandle,
  CodingTaskSessionAdmissionLeaseLocator,
} from "#application/ports/codingTaskSessionAdmissionLease/index.js";
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

import type { FileCodingTaskSessionAdmissionLeaseDependencies } from "../contracts/index.js";
import { resolveCodingTaskSessionAdmissionStorePaths } from "../path/index.js";
import { ensureCodingTaskSessionAdmissionStorePath } from "../validation/index.js";

/** 使用 .admission.lock 覆盖控制状态与 Action Journal 关键区间的跨进程 Lease。 */
export class FileCodingTaskSessionAdmissionLease implements CodingTaskSessionAdmissionLease {
  private readonly storeRoot: string;
  private readonly lockManager: FileLockManager;

  /** 仅接收 Composition Root 注入的基础设施依赖。 */
  public constructor(
    storeRoot: string,
    dependencies: FileCodingTaskSessionAdmissionLeaseDependencies,
  ) {
    if (!isAbsolute(storeRoot)) {
      throw new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Admission Lease Store Root 必须是绝对路径",
      );
    }
    this.storeRoot = resolve(storeRoot);
    this.lockManager = dependencies.lockManager;
  }

  /** 获取跨进程 Admission Lease，供 Application 持有完整关键区间。 */
  public async acquire(
    locator: CodingTaskSessionAdmissionLeaseLocator,
  ): Promise<Result<CodingTaskSessionAdmissionLeaseHandle, HarnessError>> {
    const workspaceId = parseWorkspaceId(String(locator?.workspaceId ?? ""));
    if (workspaceId.status === ResultStatus.Failure) return workspaceId;
    const sessionId = parseCodingTaskSessionId(String(locator?.sessionId ?? ""));
    if (sessionId.status === ResultStatus.Failure) return sessionId;
    const paths = resolveCodingTaskSessionAdmissionStorePaths(
      this.storeRoot,
      workspaceId.value,
      sessionId.value,
    );
    const prepared = await ensureCodingTaskSessionAdmissionStorePath(paths, true);
    if (prepared.status === ResultStatus.Failure) return prepared;
    try {
      const lock = await this.lockManager.acquire(paths.lockFile, {
        workspaceId: paths.workspaceId,
        taskId: paths.sessionId,
      });
      return success({ release: () => releaseLock(lock) });
    } catch (error) {
      return failure(
        error instanceof HarnessError
          ? error
          : new HarnessError(HarnessErrorCode.IoFailure, "Admission Lease 获取失败", {}, error),
      );
    }
  }
}

async function releaseLock(lock: ExclusiveFileLockHandle): Promise<Result<void, HarnessError>> {
  try {
    await lock.release();
    return success(undefined);
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CodingTaskSessionAdmissionLockReleaseUnknown,
        "Admission Lease 释放结果未知，必须先恢复锁状态",
        {},
        error,
      ),
    );
  }
}
