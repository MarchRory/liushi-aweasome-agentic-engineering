import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  MAX_RULE_ID_LENGTH,
  RULE_REGISTRY_ID_PATTERN,
  normalizeRulePathGlob,
} from "#domain/rule/index.js";

import type { ProjectVerificationCheck } from "../contracts/index.js";
import { VerificationRequirement, VerificationSelectionMode } from "../enums/index.js";
import { validateVerificationCheck } from "./verificationValidation.js";

const PROJECT_CHECK_FIELDS = new Set([
  "checkId",
  "kind",
  "requirement",
  "command",
  "timeoutMs",
  "retryable",
  "selectionMode",
  "pathGlobs",
  "validatorIds",
]);

/** 严格校验按 Check ID 排序的 Human/G8 项目 Verification Check 集合。 */
export function validateProjectVerificationChecks(
  input: unknown,
): Result<readonly ProjectVerificationCheck[], HarnessError> {
  if (!Array.isArray(input)) return failure(invalid("checks"));

  const checks: ProjectVerificationCheck[] = [];
  for (const [index, candidate] of input.entries()) {
    const field = `checks[${index}]`;
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).some((key) => !PROJECT_CHECK_FIELDS.has(key))
    ) {
      return failure(invalid(field));
    }
    const base = validateVerificationCheck(candidate);
    if (base.status === ResultStatus.Failure) return base;
    if (!isEnumValue(VerificationSelectionMode, candidate["selectionMode"])) {
      return failure(invalid(`${field}.selectionMode`));
    }
    const validatorIds = parseSortedRegistryIds(candidate["validatorIds"]);
    if (validatorIds === undefined) return failure(invalid(`${field}.validatorIds`));

    const pathGlobs = parseSortedPathGlobs(candidate["pathGlobs"]);
    if (pathGlobs === null) return failure(invalid(`${field}.pathGlobs`));
    if (
      base.value.requirement === VerificationRequirement.Required &&
      candidate["selectionMode"] !== VerificationSelectionMode.Always
    ) {
      return failure(invalid(`${field}.selectionMode`));
    }
    if (
      candidate["selectionMode"] === VerificationSelectionMode.Always &&
      pathGlobs !== undefined
    ) {
      return failure(invalid(`${field}.pathGlobs`));
    }
    if (
      candidate["selectionMode"] === VerificationSelectionMode.ChangedPaths &&
      (pathGlobs === undefined || pathGlobs.length === 0)
    ) {
      return failure(invalid(`${field}.pathGlobs`));
    }

    checks.push({
      ...base.value,
      selectionMode: candidate["selectionMode"],
      ...(pathGlobs === undefined ? {} : { pathGlobs }),
      validatorIds,
    });
  }

  if (!isSortedUnique(checks.map((check) => check.checkId))) {
    return failure(invalid("checks"));
  }
  if (!checks.some((check) => check.requirement === VerificationRequirement.Required)) {
    return failure(invalid("checks.required"));
  }
  return success(checks);
}

function parseSortedRegistryIds(input: unknown): readonly string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input.filter(
    (value): value is string =>
      typeof value === "string" &&
      value.length <= MAX_RULE_ID_LENGTH &&
      RULE_REGISTRY_ID_PATTERN.test(value),
  );
  return values.length === input.length && isSortedUnique(values) ? values : undefined;
}

function parseSortedPathGlobs(input: unknown): readonly string[] | undefined | null {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return null;

  const values: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") return null;
    const normalized = normalizeRulePathGlob(value);
    if (normalized.status === ResultStatus.Failure || normalized.value !== value) return null;
    values.push(value);
  }
  return isSortedUnique(values) ? values : null;
}

function isSortedUnique(values: readonly string[]): boolean {
  const sorted = [...values].sort(compare);
  return (
    values.length === sorted.length &&
    values.every((value, index) => value === sorted[index]) &&
    new Set(values).size === values.length
  );
}

function isEnumValue<T extends Record<string, string>>(
  enumObject: T,
  value: unknown,
): value is T[keyof T] {
  return typeof value === "string" && Object.values(enumObject).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalid(field: string): HarnessError {
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    "Project verification checks are invalid.",
    {
      field,
    },
  );
}
