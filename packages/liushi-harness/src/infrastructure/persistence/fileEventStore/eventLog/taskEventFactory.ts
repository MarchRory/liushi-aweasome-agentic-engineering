import {
  GENESIS_EVENT_HASH,
  ResultStatus,
  TASK_EVENT_SCHEMA_VERSION,
  success,
  type HarnessError,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import {
  TaskEventType,
  parseEventId,
  type TaskEventRecord,
  type TaskState,
} from "#domain/task/index.js";

import { FIRST_TASK_EVENT_SEQUENCE } from "../constants/index.js";
import { calculateTaskEventHash, type TaskEventHashInput } from "./eventHash.js";

/** 从已校验初始 Task State 构建 TaskCreated Event。 */
export function createTaskCreatedEvent(
  task: TaskState,
  eventIdGenerator: IdGenerator,
): Result<TaskEventRecord, HarnessError> {
  const eventIdResult = parseEventId(eventIdGenerator.next());
  if (eventIdResult.status === ResultStatus.Failure) {
    return eventIdResult;
  }

  const eventWithoutHash: TaskEventHashInput = {
    schemaVersion: TASK_EVENT_SCHEMA_VERSION,
    eventId: eventIdResult.value,
    taskId: task.taskId,
    workspaceId: task.workspaceId,
    sequence: FIRST_TASK_EVENT_SEQUENCE,
    type: TaskEventType.TaskCreated,
    occurredAt: task.createdAt,
    actor: task.createdBy,
    payload: { task },
    previousHash: GENESIS_EVENT_HASH,
  };
  return success({
    ...eventWithoutHash,
    hash: calculateTaskEventHash(eventWithoutHash),
  });
}
