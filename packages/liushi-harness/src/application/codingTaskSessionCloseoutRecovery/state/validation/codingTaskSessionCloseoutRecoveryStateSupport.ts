import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";

/** 允许安全读取的未知对象。 */
export type UnknownRecord = Record<string, unknown>;

/** 判断输入是否为非数组对象。 */
export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 严格校验对象键集合，拒绝额外字段。 */
export function hasExactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

/** 解析不含控制字符的非空文本。 */
export function parseSafeText(value: unknown, field: string): Result<string, HarnessErrorType> {
  return typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
    ? success(value)
    : failure(invalid(field));
}

/** 解析通用 Content Digest。 */
export function parseDigest(
  value: unknown,
  field: string,
): Result<ContentDigest, HarnessErrorType> {
  if (typeof value !== "string") return failure(invalid(field));
  const parsed = parseContentDigest(value);
  return parsed.status === ResultStatus.Failure ? failure(invalid(field)) : parsed;
}

/** 解析规范的 ISO UTC 时间。 */
export function parseIsoUtc(value: unknown, field: string): Result<string, HarnessErrorType> {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
  ) {
    return failure(invalid(field));
  }
  const parsed = new Date(value);
  const expected = value.includes(".") ? value : `${value.slice(0, -1)}.000Z`;
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === expected
    ? success(value)
    : failure(invalid(field));
}

/** 解析非负安全整数。 */
export function parseNonNegativeInteger(
  value: unknown,
  field: string,
): Result<number, HarnessErrorType> {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? success(value)
    : failure(invalid(field));
}

/** 将状态模型输入统一包装为稳定输入错误。 */
export function invalid(
  field: string,
  message = "Closeout Recovery State 输入无效。",
): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, message, { field });
}

/** 创建不满足状态机前置条件的迁移错误。 */
export function invalidTransition(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidStateTransition, message);
}
