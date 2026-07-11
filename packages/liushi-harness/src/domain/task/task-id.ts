import { HarnessError, HarnessErrorCode } from "../../common/errors/harness-error.js";
import { failure, success, type Result } from "../../common/result/result.js";

declare const taskIdBrand: unique symbol;
declare const eventIdBrand: unique symbol;

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** 经过 ULID 格式校验的 Task ID。 */
export type TaskId = string & { readonly [taskIdBrand]: true };

/** 经过 ULID 格式校验的 Event ID。 */
export type EventId = string & { readonly [eventIdBrand]: true };

/** 将外部字符串校验并转换为 Task ID。 */
export function parseTaskId(value: string): Result<TaskId, HarnessError> {
  if (!ULID_PATTERN.test(value)) {
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
  if (!ULID_PATTERN.test(value)) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Event ID must be an uppercase ULID.", {
        field: "eventId",
      }),
    );
  }

  return success(value as EventId);
}
