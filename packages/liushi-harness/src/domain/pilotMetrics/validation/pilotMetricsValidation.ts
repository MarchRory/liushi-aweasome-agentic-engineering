import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";

import type {
  PilotEnrollment,
  PilotEnrollmentInput,
  PilotMetricsDigestPort,
  PilotSettlement,
  PilotSettlementInput,
} from "../contracts/index.js";
import { PilotEnrollmentSchemaVersion, PilotSettlementSchemaVersion } from "../enums/index.js";
import {
  enrollmentInputSchema,
  enrollmentSchema,
  settlementInputSchema,
  settlementSchema,
} from "../schemas/index.js";

/** 创建 Enrollment 并计算其不可变记录摘要。 */
export function createPilotEnrollment(
  input: unknown,
  digestPort: PilotMetricsDigestPort,
): Result<PilotEnrollment, HarnessError> {
  const parsedInput = enrollmentInputSchema.safeParse(input);
  if (!parsedInput.success) return invalid("Enrollment 输入无效", parsedInput.error);
  return withDigest(
    parsedInput.data as PilotEnrollmentInput,
    PilotEnrollmentSchemaVersion.V1,
    digestPort,
    (record) => deepFreeze(record),
  );
}

/** 严格重建 Enrollment 并复算全部规范字段摘要。 */
export function rebuildPilotEnrollment(
  input: unknown,
  digestPort: PilotMetricsDigestPort,
): Result<PilotEnrollment, HarnessError> {
  const parsedRecord = enrollmentSchema.safeParse(input);
  if (!parsedRecord.success) return invalid("持久化 Enrollment 无效", parsedRecord.error);
  return verifyDigest(parsedRecord.data as PilotEnrollment, digestPort, "Enrollment");
}

/** 创建 Settlement 并计算其不可变记录摘要。 */
export function createPilotSettlement(
  input: unknown,
  digestPort: PilotMetricsDigestPort,
): Result<PilotSettlement, HarnessError> {
  const parsedInput = settlementInputSchema.safeParse(input);
  if (!parsedInput.success) return invalid("Settlement 输入无效", parsedInput.error);
  return withDigest(
    parsedInput.data as PilotSettlementInput,
    PilotSettlementSchemaVersion.V1,
    digestPort,
    (record) => deepFreeze(record),
  );
}

/** 严格重建 Settlement 并复算全部规范字段摘要。 */
export function rebuildPilotSettlement(
  input: unknown,
  digestPort: PilotMetricsDigestPort,
): Result<PilotSettlement, HarnessError> {
  const parsedRecord = settlementSchema.safeParse(input);
  if (!parsedRecord.success) return invalid("持久化 Settlement 无效", parsedRecord.error);
  return verifyDigest(parsedRecord.data as PilotSettlement, digestPort, "Settlement");
}

/** Application 使用的 Enrollment Draft 创建入口。 */
export const createPilotMetricsEnrollment = createPilotEnrollment;

/** Store 读取时使用的 Enrollment 严格重建入口。 */
export const rebuildPilotMetricsEnrollment = rebuildPilotEnrollment;

/** Application 使用的 Settlement Draft 创建入口。 */
export const createPilotMetricsSettlement = createPilotSettlement;

/** Store 读取时使用的 Settlement 严格重建入口。 */
export const rebuildPilotMetricsSettlement = rebuildPilotSettlement;

function withDigest<
  T extends PilotEnrollmentInput | PilotSettlementInput,
  V extends PilotEnrollmentSchemaVersion | PilotSettlementSchemaVersion,
  R extends T & { schemaVersion: V; recordDigest: ContentDigest },
>(
  input: T,
  schemaVersion: V,
  digestPort: PilotMetricsDigestPort,
  freeze: (record: R) => R,
): Result<R, HarnessError> {
  const calculated = digestPort.calculate({ ...input, schemaVersion });
  if (calculated.status === ResultStatus.Failure) return calculated;
  const parsed = parseContentDigest(calculated.value);
  if (parsed.status === ResultStatus.Failure) return parsed;
  return success(freeze({ ...input, schemaVersion, recordDigest: parsed.value } as R));
}

function verifyDigest<T extends PilotEnrollment | PilotSettlement>(
  record: T,
  digestPort: PilotMetricsDigestPort,
  name: string,
): Result<T, HarnessError> {
  const { recordDigest, ...input } = record;
  const calculated = digestPort.calculate(input);
  if (calculated.status === ResultStatus.Failure) return calculated;
  if (calculated.value !== recordDigest) {
    return failure(
      new HarnessError(HarnessErrorCode.PreconditionNotMet, `${name} recordDigest 漂移`, {
        field: "recordDigest",
      }),
    );
  }
  return success(deepFreeze({ ...record }));
}

function invalid(message: string, cause?: unknown): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message, {}, cause));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
