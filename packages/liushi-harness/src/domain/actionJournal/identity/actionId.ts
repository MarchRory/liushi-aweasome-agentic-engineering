import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { ACTION_ID_PATTERN } from "../constants/index.js";

declare const actionIdBrand: unique symbol;

/** 经过 ULID 格式校验的 Action ID。 */
export type ActionId = string & { readonly [actionIdBrand]: true };

/** 将外部字符串校验并转换为 Action ID。 */
export function parseActionId(value: string): Result<ActionId, HarnessError> {
  if (!ACTION_ID_PATTERN.test(value)) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Action ID 必须是大写 ULID。", {
        field: "actionId",
      }),
    );
  }
  return success(value as ActionId);
}
