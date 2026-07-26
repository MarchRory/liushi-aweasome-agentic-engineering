import type { HarnessError, Result } from "#common/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { CodingTaskSessionCloseoutStateCreateDisposition } from "../enums/index.js";

/** Closeout State 的 Workspace/Session 定位信息。 */
export interface CodingTaskSessionCloseoutStateLocator {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
}

/** Closeout State create-only 的结果。 */
export interface CodingTaskSessionCloseoutStateCreateResult<
  TState extends CodingTaskSessionCloseoutStateRecord,
> {
  /** 首次创建、同请求恢复复用或身份冲突。 */
  readonly disposition: CodingTaskSessionCloseoutStateCreateDisposition;
  /** 已从 Store 严格重建的 State。 */
  readonly state: TState;
}

/** Closeout Store 操作所需的最小版本化记录。 */
export interface CodingTaskSessionCloseoutStateRecord {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** 乐观并发版本。 */
  readonly version: number;
}

/** Closeout State replace 的乐观并发输入。 */
export interface CodingTaskSessionCloseoutStateReplaceInput<
  TState extends CodingTaskSessionCloseoutStateRecord,
> {
  /** 调用方读取到的持久化版本。 */
  readonly expectedVersion: number;
  /** 由纯 transition 产生的下一版本 State。 */
  readonly state: TState;
}

/** Closeout Process State 的持久化 Port。 */
export interface CodingTaskSessionCloseoutStateStore<
  TState extends CodingTaskSessionCloseoutStateRecord,
> {
  /** 仅创建初始 Closing；同请求返回现有进度，不同身份返回 Conflict。 */
  create(
    state: TState,
  ): Promise<Result<CodingTaskSessionCloseoutStateCreateResult<TState>, HarnessError>>;
  /** 按 Workspace/Session 定位 State；目录或文件不存在时返回 null。 */
  find(
    locator: CodingTaskSessionCloseoutStateLocator,
  ): Promise<Result<TState | null, HarnessError>>;
  /** 按 Workspace/Session 定位并严格重建 State。 */
  load(locator: CodingTaskSessionCloseoutStateLocator): Promise<Result<TState, HarnessError>>;
  /** 在同一内部状态锁内执行 expectedVersion CAS 替换。 */
  replace(
    input: CodingTaskSessionCloseoutStateReplaceInput<TState>,
  ): Promise<Result<TState, HarnessError>>;
}
