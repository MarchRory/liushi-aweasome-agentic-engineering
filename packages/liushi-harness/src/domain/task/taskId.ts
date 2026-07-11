import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { TASK_ULID_PATTERN } from "./taskConstants.js";

declare const taskIdBrand: unique symbol;
declare const eventIdBrand: unique symbol;

/** 经过 ULID 格式校验的 Task ID。 */
export type TaskId = string & { readonly [taskIdBrand]: true };

/** 经过 ULID 格式校验的 Event ID。 */
export type EventId = string & { readonly [eventIdBrand]: true };

/** 将外部字符串校验并转换为 Task ID。 */
export function parseTaskId(value: string): Result<TaskId, HarnessError> {
  if (!isTaskUlid(value)) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Task ID must be an uppercase ULID.", {
        field: "taskId",
      }),
    );
  }

  return success(value as TaskId);
}

/** 将生成器结果校验并转换为 Event ID。 */
export function parseEventId(value: string): Result<EventId, HarnessError> {
  if (!isTaskUlid(value)) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Event ID must be an uppercase ULID.", {
        field: "eventId",
      }),
    );
  }

  return success(value as EventId);
}

/** 判断字符串是否满足 Task/Event 共用的 uppercase ULID 格式。 */
export function isTaskUlid(value: string): boolean {
  return TASK_ULID_PATTERN.test(value);
}
