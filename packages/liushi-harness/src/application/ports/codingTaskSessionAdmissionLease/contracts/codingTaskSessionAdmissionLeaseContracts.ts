import type { HarnessError, Result } from "#common/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** Admission Lease 的 Workspace/Session 定位。 */
export interface CodingTaskSessionAdmissionLeaseLocator {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
}

/** 已取得的跨进程 Admission Lease。 */
export interface CodingTaskSessionAdmissionLeaseHandle {
  /** 释放 Lease；释放结果未知时必须 fail closed。 */
  release(): Promise<Result<void, HarnessError>>;
}

/** 覆盖控制状态与 Action Journal 整个关键区间的 Lease Port。 */
export interface CodingTaskSessionAdmissionLease {
  /** 获取指定 Workspace/Session 的排他 Lease。 */
  acquire(
    locator: CodingTaskSessionAdmissionLeaseLocator,
  ): Promise<Result<CodingTaskSessionAdmissionLeaseHandle, HarnessError>>;
}
