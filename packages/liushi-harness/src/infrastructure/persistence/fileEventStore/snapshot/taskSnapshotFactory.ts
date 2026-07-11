import {
  TASK_AGGREGATE_SNAPSHOT_SCHEMA_VERSION,
  TASK_SNAPSHOT_SCHEMA_VERSION,
} from "#common/index.js";
import type { TaskEventRecord, TaskSnapshot } from "#domain/task/index.js";
import type { TaskAggregateRecord, TaskAggregateSnapshot } from "#domain/taskRun/index.js";

/** 从已提交 Event 创建对应 Task Snapshot。 */
export function createTaskSnapshot(event: TaskEventRecord): TaskSnapshot {
  return {
    schemaVersion: TASK_SNAPSHOT_SCHEMA_VERSION,
    task: event.payload.task,
    lastSequence: event.sequence,
    lastEventHash: event.hash,
  };
}

/** 从完整 Event Replay 结果创建新版 Task Aggregate Snapshot。 */
export function createTaskAggregateSnapshot(record: TaskAggregateRecord): TaskAggregateSnapshot {
  return {
    schemaVersion: TASK_AGGREGATE_SNAPSHOT_SCHEMA_VERSION,
    aggregate: record.aggregate,
    lastSequence: record.lastSequence,
    lastEventHash: record.lastEventHash,
  };
}
