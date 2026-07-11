import type { TaskRunEventRecord } from "#domain/taskRun/index.js";

import type { TaskReplayResult } from "../contracts/index.js";

/** 已完成 Event Replay 与可选 Snapshot 交叉校验的 Task Store。 */
export interface LoadedTaskStore {
  /** 已按 Sequence 排序并通过 Schema 校验的 Event。 */
  events: readonly TaskRunEventRecord[];
  /** 从 Event Chain 重建的权威状态。 */
  replay: TaskReplayResult;
}
