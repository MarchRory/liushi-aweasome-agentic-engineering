import { z } from "zod";

import { TASK_STATE_SCHEMA_VERSION, actorRefSchema } from "#common/index.js";
import {
  MAX_TASK_SOURCE_LENGTH,
  TaskPhase,
  TaskRunState,
  isTaskUlid,
  type EventId,
  type TaskId,
  type TaskState,
} from "#domain/task/index.js";
import { isWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

/** 持久化 Task ID Schema。 */
export const taskIdSchema = z
  .string()
  .refine(isTaskUlid)
  .transform((value) => value as TaskId);

/** 持久化 Event ID Schema。 */
export const eventIdSchema = z
  .string()
  .refine(isTaskUlid)
  .transform((value) => value as EventId);

/** 持久化 Workspace ID Schema。 */
export const workspaceIdSchema = z
  .string()
  .refine(isWorkspaceId)
  .transform((value) => value as WorkspaceId);

/** 不带算法前缀的 Event Hash Schema。 */
export const eventHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** 兼容旧 Event Hash 的 TaskState Schema。 */
export const taskStateSchema = z
  .object({
    schemaVersion: z.literal(TASK_STATE_SCHEMA_VERSION),
    taskId: taskIdSchema,
    workspaceId: workspaceIdSchema,
    source: z
      .string()
      .min(1)
      .max(MAX_TASK_SOURCE_LENGTH)
      .refine((value) => value === value.trim())
      .optional(),
    phase: z.enum(TaskPhase),
    runState: z.enum(TaskRunState),
    createdBy: actorRefSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

/** 将 TaskState Schema 输出映射为 exact-optional 领域对象。 */
export function mapTaskState(task: z.infer<typeof taskStateSchema>): TaskState {
  return {
    schemaVersion: task.schemaVersion,
    taskId: task.taskId,
    workspaceId: task.workspaceId,
    ...(task.source === undefined ? {} : { source: task.source }),
    phase: task.phase,
    runState: task.runState,
    createdBy: task.createdBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
