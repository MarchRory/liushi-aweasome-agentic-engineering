import type { CodingTaskSessionActivationRecord } from "#domain/codingTaskSession/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { CodingTaskSessionActivationDisposition } from "../enums/index.js";

/** 定位一个外部 CodingTask Session Activation Record。 */
export interface CodingTaskSessionActivationLocator {
  /** Harness 工作区 ID。 */
  readonly workspaceId: WorkspaceId;
  /** 外部 Session ULID。 */
  readonly sessionId: CodingTaskSessionId;
}

/** Activation Record create 的持久化结果。 */
export interface CodingTaskSessionActivationCreateResult {
  /** Created、Reused 或 Conflict。 */
  readonly disposition: CodingTaskSessionActivationDisposition;
  /** 经过领域重建和 Digest 复验的 Record。 */
  readonly record: CodingTaskSessionActivationRecord;
}
