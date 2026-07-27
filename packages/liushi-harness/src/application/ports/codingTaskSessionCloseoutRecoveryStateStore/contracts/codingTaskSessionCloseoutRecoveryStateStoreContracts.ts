import type { HarnessError, Result } from "#common/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { CodingTaskSessionCloseoutRecoveryStateCreateDisposition } from "../enums/index.js";

/** Recovery State 的 Workspace/Session 文件定位信息。 */
export interface CodingTaskSessionCloseoutRecoveryStateLocator {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
}

/** Recovery Store Port 需要的最小 State 记录形状。 */
export interface CodingTaskSessionCloseoutRecoveryStateRecord {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** 乐观并发版本。 */
  readonly version: number;
}

/** Recovery State create-only 的结果分类。 */
export interface CodingTaskSessionCloseoutRecoveryStateCreateResult<
  TState extends CodingTaskSessionCloseoutRecoveryStateRecord,
> {
  /** 首次创建、同一身份复用或身份冲突。 */
  readonly disposition: CodingTaskSessionCloseoutRecoveryStateCreateDisposition;
  /** 从 Store 严格重建出的当前 State。 */
  readonly state: TState;
}

/** Recovery State replace 的乐观并发控制输入。 */
export interface CodingTaskSessionCloseoutRecoveryStateReplaceInput<
  TState extends CodingTaskSessionCloseoutRecoveryStateRecord,
> {
  /** 调用方读取到的当前持久化版本。 */
  readonly expectedVersion: number;
  /** 由领域 transition 产生的下一版本 State。 */
  readonly state: TState;
}

/** Recovery Process State 的持久化 Port。 */
export interface CodingTaskSessionCloseoutRecoveryStateStore<
  TState extends CodingTaskSessionCloseoutRecoveryStateRecord,
> {
  /** 只接受 Approved v0；同身份保留既有进度，不覆盖已有记录。 */
  create(
    state: TState,
  ): Promise<Result<CodingTaskSessionCloseoutRecoveryStateCreateResult<TState>, HarnessError>>;
  /** 按 Workspace/Session 查找 State；不存在时返回 null。 */
  find(
    locator: CodingTaskSessionCloseoutRecoveryStateLocator,
  ): Promise<Result<TState | null, HarnessError>>;
  /** 按 Workspace/Session 严格重建 State；不存在时返回 PreconditionNotMet。 */
  load(
    locator: CodingTaskSessionCloseoutRecoveryStateLocator,
  ): Promise<Result<TState, HarnessError>>;
  /** 在短时 State Lock 内执行 expectedVersion CAS successor 替换。 */
  replace(
    input: CodingTaskSessionCloseoutRecoveryStateReplaceInput<TState>,
  ): Promise<Result<TState, HarnessError>>;
}
