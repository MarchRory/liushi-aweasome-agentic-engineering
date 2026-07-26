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

/** 可安全读取字段的普通对象。 */
export type UnknownRecord = Record<string, unknown>;

/** 判断输入是否为可验证的对象。 */
export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 严格检查对象没有未知字段。 */
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

/** 解析非空且不含控制字符的规范文本。 */
export function parseSafeText(value: unknown, field: string): Result<string, HarnessErrorType> {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return failure(invalid(field));
  }
  return success(value);
}

/** 解析 ContentDigest 并把错误绑定到具体字段。 */
export function parseDigest(
  value: unknown,
  field: string,
): Result<ContentDigest, HarnessErrorType> {
  if (typeof value !== "string") return failure(invalid(field));
  const parsed = parseContentDigest(value);
  return parsed.status === ResultStatus.Failure ? failure(invalid(field)) : parsed;
}

/** 解析严格的 UTC ISO 时间。 */
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

/** 以稳定的输入错误包装校验失败。 */
export function invalid(field: string, message = "Closeout State 输入无效。"): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, message, { field });
}
