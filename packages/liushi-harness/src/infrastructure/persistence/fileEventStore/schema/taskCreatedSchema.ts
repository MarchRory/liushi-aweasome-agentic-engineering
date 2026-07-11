import { z } from "zod";

import {
  TASK_EVENT_SCHEMA_VERSION,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";
import { TaskEventType, type TaskEventRecord } from "#domain/task/index.js";

import { createPersistenceSchemaError } from "./schemaError.js";
import {
  eventHashSchema,
  eventIdSchema,
  mapTaskState,
  taskIdSchema,
  taskStateSchema,
  workspaceIdSchema,
} from "./schemaPrimitives.js";
import { actorRefSchema } from "#common/index.js";

const taskCreatedEventSchema = z
  .object({
    schemaVersion: z.literal(TASK_EVENT_SCHEMA_VERSION),
    eventId: eventIdSchema,
    taskId: taskIdSchema,
    workspaceId: workspaceIdSchema,
    sequence: z.number().int().positive(),
    type: z.literal(TaskEventType.TaskCreated),
    occurredAt: z.string().datetime(),
    actor: actorRefSchema,
    payload: z.object({ task: taskStateSchema }).strict(),
    previousHash: eventHashSchema,
    hash: eventHashSchema,
  })
  .strict();

/** 校验未知输入并返回旧版 TaskCreated Event Record。 */
export function parseTaskEventRecord(input: unknown): Result<TaskEventRecord, HarnessError> {
  const parsed = taskCreatedEventSchema.safeParse(input);
  if (!parsed.success) {
    return failure(createPersistenceSchemaError("Task event", parsed.error));
  }

  const event = parsed.data;
  return success({
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    taskId: event.taskId,
    workspaceId: event.workspaceId,
    sequence: event.sequence,
    type: event.type,
    occurredAt: event.occurredAt,
    actor: event.actor,
    payload: { task: mapTaskState(event.payload.task) },
    previousHash: event.previousHash,
    hash: event.hash,
  });
}
