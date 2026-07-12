import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const EVENT_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

declare const codingTaskIdBrand: unique symbol;
declare const codingTaskEventIdBrand: unique symbol;

/** 经过格式校验的 CodingTask 稳定标识。 */
export type CodingTaskId = string & { readonly [codingTaskIdBrand]: true };

/** 经过 ULID 格式校验的 CodingTask 事件标识。 */
export type CodingTaskEventId = string & { readonly [codingTaskEventIdBrand]: true };

/** 将外部字符串解析为 CodingTask 标识。 */
export function parseCodingTaskId(value: string): Result<CodingTaskId, HarnessError> {
  return ID_PATTERN.test(value)
    ? success(value as CodingTaskId)
    : failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "CodingTask ID 格式无效。", {
          field: "codingTaskId",
        }),
      );
}

/** 将外部字符串解析为 CodingTask 事件标识。 */
export function parseCodingTaskEventId(value: string): Result<CodingTaskEventId, HarnessError> {
  return EVENT_ID_PATTERN.test(value)
    ? success(value as CodingTaskEventId)
    : failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "CodingTask Event ID 必须是大写 ULID。", {
          field: "eventId",
        }),
      );
}
