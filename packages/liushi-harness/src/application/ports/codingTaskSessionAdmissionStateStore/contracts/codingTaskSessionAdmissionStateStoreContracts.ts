import type { HarnessError, Result } from "#common/index.js";
import type { CodingTaskSessionAdmissionState } from "#domain/codingTaskSession/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { CodingTaskSessionAdmissionStateCreateDisposition } from "../enums/index.js";

/** Admission State 的 Workspace/Session 定位。 */
export interface CodingTaskSessionAdmissionStateLocator {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
}

/** Admission State create-only 的返回结果。 */
export interface CodingTaskSessionAdmissionStateCreateResult {
  /** 首次创建、幂等复用或冲突。 */
  readonly disposition: CodingTaskSessionAdmissionStateCreateDisposition;
  /** 经过领域重建的状态。 */
  readonly state: CodingTaskSessionAdmissionState;
}

/** Admission State replace 的乐观并发输入。 */
export interface CodingTaskSessionAdmissionStateReplaceInput {
  /** 期望当前持久化版本。 */
  readonly expectedVersion: number;
  /** 经过领域 transition 产生的候选状态。 */
  readonly state: CodingTaskSessionAdmissionState;
}

/** Admission State 持久化 Port。 */
export interface CodingTaskSessionAdmissionStateStore {
  /** 仅创建初始文件；同内容复用，不同内容冲突。 */
  create(
    state: CodingTaskSessionAdmissionState,
  ): Promise<Result<CodingTaskSessionAdmissionStateCreateResult, HarnessError>>;
  /** 按 Workspace 与 Session 加载并严格重建状态。 */
  load(
    locator: CodingTaskSessionAdmissionStateLocator,
  ): Promise<Result<CodingTaskSessionAdmissionState, HarnessError>>;
  /** 在 expectedVersion 匹配时原子替换状态文件；Application 应先取得对应 Admission Lease。 */
  replace(
    input: CodingTaskSessionAdmissionStateReplaceInput,
  ): Promise<Result<CodingTaskSessionAdmissionState, HarnessError>>;
}
