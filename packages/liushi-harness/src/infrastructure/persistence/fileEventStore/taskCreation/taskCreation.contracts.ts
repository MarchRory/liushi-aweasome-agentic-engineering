import type { IdGenerator } from "#common/index.js";
import type { TaskEventRecord, TaskSnapshot } from "#domain/task/index.js";

import type { TaskReplayResult } from "../contracts/index.js";
import type { FileLockManager } from "../lock/index.js";
import type { ParentDirectoryDurability } from "../parentDirectoryDurability/index.js";
import type { SnapshotStore } from "../snapshot/index.js";

/** File Task 创建流程使用的可替换依赖。 */
export interface TaskPersistenceDependencies {
  /** Event ID 生成器。 */
  eventIdGenerator: IdGenerator;
  /** Snapshot Store 适配器。 */
  snapshotStore: SnapshotStore;
  /** File Lock Manager 适配器。 */
  lockManager: FileLockManager;
  /** 父目录 fsync Adapter。 */
  parentDirectoryDurability: ParentDirectoryDurability;
}

/** 在进入文件提交边界前完成校验的 Task 创建数据。 */
export interface PreparedTaskCreation {
  /** 等待写入 Event Log 的首条 Event。 */
  event: TaskEventRecord;
  /** 从内存 Event Replay 得到的权威状态。 */
  replay: TaskReplayResult;
  /** Event 提交后等待原子写入的预计算 Snapshot。 */
  snapshot: TaskSnapshot;
}
