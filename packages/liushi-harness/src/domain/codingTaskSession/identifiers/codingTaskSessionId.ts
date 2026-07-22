import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { CODING_TASK_SESSION_ID_PATTERN } from "../constants/index.js";

declare const codingTaskSessionIdBrand: unique symbol;

/** 经过独立 ULID 校验的外部 CodingTask Session ID。 */
export type CodingTaskSessionId = string & {
  readonly [codingTaskSessionIdBrand]: true;
};

/** 将外部字符串解析为不含路径字符的 Session ULID。 */
export function parseCodingTaskSessionId(value: string): Result<CodingTaskSessionId, HarnessError> {
  if (!CODING_TASK_SESSION_ID_PATTERN.test(value)) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "CodingTask Session ID 必须是 uppercase ULID。",
        { field: "sessionId" },
      ),
    );
  }
  return success(value as CodingTaskSessionId);
}
