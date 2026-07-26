import {
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";

import { CodingTaskSessionCloseoutStage, CodingTaskSessionCloseoutStatus } from "../enums/index.js";
import { invalid, parseSafeText } from "./closeoutValidationSupport.js";

/** 严格解析 Closeout 生命周期状态。 */
export function parseCloseoutStatus(
  value: unknown,
): Result<CodingTaskSessionCloseoutStatus, HarnessError> {
  return typeof value === "string" &&
    Object.values(CodingTaskSessionCloseoutStatus).includes(
      value as CodingTaskSessionCloseoutStatus,
    )
    ? success(value as CodingTaskSessionCloseoutStatus)
    : failure(invalid("status"));
}

/** 严格解析可空活动阶段。 */
export function parseNullableCloseoutStage(
  value: unknown,
): Result<CodingTaskSessionCloseoutStage | null, HarnessError> {
  if (value === null) return success(null);
  return typeof value === "string" &&
    Object.values(CodingTaskSessionCloseoutStage).includes(value as CodingTaskSessionCloseoutStage)
    ? success(value as CodingTaskSessionCloseoutStage)
    : failure(invalid("stoppedStage"));
}

/** 严格解析可空 Harness 错误码。 */
export function parseNullableHarnessErrorCode(
  value: unknown,
): Result<HarnessErrorCode | null, HarnessError> {
  if (value === null) return success(null);
  return parseHarnessErrorCode(value);
}

/** 严格解析 Harness 错误码。 */
export function parseHarnessErrorCode(value: unknown): Result<HarnessErrorCode, HarnessError> {
  return typeof value === "string" &&
    Object.values(HarnessErrorCode).includes(value as HarnessErrorCode)
    ? success(value as HarnessErrorCode)
    : failure(invalid("errorCode"));
}

/** 严格解析可空规范文本。 */
export function parseNullableSafeText(
  value: unknown,
  field: string,
): Result<string | null, HarnessError> {
  if (value === null) return success(null);
  const parsed = parseSafeText(value, field);
  return parsed.status === ResultStatus.Failure ? parsed : success(parsed.value);
}

/** 严格解析乐观并发版本。 */
export function parseCloseoutVersion(value: unknown): Result<number, HarnessError> {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? success(value)
    : failure(invalid("version"));
}
