import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

declare const traceIdBrand: unique symbol;
declare const spanIdBrand: unique symbol;

/** W3C/OpenTelemetry 兼容的 16-byte 小写十六进制 Trace ID。 */
export type TraceId = string & { readonly [traceIdBrand]: true };

/** W3C/OpenTelemetry 兼容的 8-byte 小写十六进制 Span ID。 */
export type SpanId = string & { readonly [spanIdBrand]: true };

/** 校验并收窄 Trace ID。 */
export function parseTraceId(input: string): Result<TraceId, HarnessError> {
  return parseIdentity(input, 32, "traceId") as Result<TraceId, HarnessError>;
}

/** 校验并收窄 Span ID。 */
export function parseSpanId(input: string): Result<SpanId, HarnessError> {
  return parseIdentity(input, 16, "spanId") as Result<SpanId, HarnessError>;
}

function parseIdentity(input: string, length: number, field: string): Result<string, HarnessError> {
  if (!new RegExp(`^[0-9a-f]{${length}}$`, "u").test(input) || /^0+$/u.test(input)) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, `${field} 必须是非零小写十六进制标识。`, {
        field,
      }),
    );
  }
  return success(input);
}
