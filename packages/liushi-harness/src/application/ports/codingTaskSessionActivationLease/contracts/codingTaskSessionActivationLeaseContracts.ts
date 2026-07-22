import type { HarnessError, Result } from "#common/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** 按 Workspace 与 Session 定位 Activation Lease。 */
export interface CodingTaskSessionActivationLeaseLocator {
  /** Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** Coding Task Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
}

/** 已持有的 Session Activation Lease。 */
export interface CodingTaskSessionActivationLeaseHandle {
  /** 释放失败时返回错误，调用方必须 fail closed。 */
  release(): Promise<Result<void, HarnessError>>;
}

/** 跨进程排他的 Session Activation Lease Port。 */
export interface CodingTaskSessionActivationLease {
  /** 获取指定 Workspace 与 Session 的独占 Activation Lease。 */
  acquire(
    locator: CodingTaskSessionActivationLeaseLocator,
  ): Promise<Result<CodingTaskSessionActivationLeaseHandle, HarnessError>>;
}
