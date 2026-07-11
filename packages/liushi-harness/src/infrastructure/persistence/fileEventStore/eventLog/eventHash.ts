import { createHash } from "node:crypto";

import { TaskEventType, type TaskEventRecord } from "#domain/task/index.js";
import type { TaskRunEventRecord } from "#domain/taskRun/index.js";
import { calculateCanonicalJsonSha256 } from "#infrastructure/serialization/jsonDigest/index.js";

/** 尚未附加当前 Hash 的 Task Event 内容。 */
export type TaskEventHashInput = Omit<TaskEventRecord, "hash">;

/** 对稳定字段顺序的 Task Event 内容计算 SHA-256。 */
export function calculateTaskEventHash(event: TaskEventHashInput): string {
  const task = event.payload.task;
  const canonical = {
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    taskId: event.taskId,
    workspaceId: event.workspaceId,
    sequence: event.sequence,
    type: event.type,
    occurredAt: event.occurredAt,
    actor: {
      kind: event.actor.kind,
      actorId: event.actor.actorId,
    },
    payload: {
      task: {
        schemaVersion: task.schemaVersion,
        taskId: task.taskId,
        workspaceId: task.workspaceId,
        ...(task.source === undefined ? {} : { source: task.source }),
        phase: task.phase,
        runState: task.runState,
        createdBy: {
          kind: task.createdBy.kind,
          actorId: task.createdBy.actorId,
        },
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    },
    previousHash: event.previousHash,
  };

  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

/** 尚未附加当前 Hash 的完整 Task Run Event 内容。 */
export type TaskRunEventHashInput = TaskRunEventRecord extends infer TEvent
  ? TEvent extends TaskRunEventRecord
    ? Omit<TEvent, "hash">
    : never
  : never;

/** 使用旧算法或 RFC 8785 算法计算对应 Event 的兼容 Hash。 */
export function calculateTaskRunEventHash(event: TaskRunEventHashInput): string {
  return event.type === TaskEventType.TaskCreated
    ? calculateTaskEventHash(event)
    : calculateCanonicalJsonSha256(event);
}
