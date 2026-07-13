import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { parseRepositoryId } from "#domain/workspace/index.js";

import {
  MAX_VERIFICATION_ARGUMENT_COUNT,
  MAX_VERIFICATION_EXECUTABLE_LENGTH,
  MAX_VERIFICATION_IDENTIFIER_LENGTH,
  MAX_VERIFICATION_TIMEOUT_MS,
  VERIFICATION_PLAN_SCHEMA_VERSION,
} from "../constants/index.js";
import { VerificationKind, VerificationRequirement } from "../enums/index.js";
import type {
  VerificationCheck,
  VerificationCommandSpec,
  VerificationPlan,
} from "../contracts/index.js";

/** 校验并返回可供 Verification Use Case 使用的规范 Plan。 */
export function validateVerificationPlan(input: unknown): Result<VerificationPlan, HarnessError> {
  if (!isRecord(input)) return failure(invalid("plan"));
  if (input["schemaVersion"] !== VERIFICATION_PLAN_SCHEMA_VERSION) {
    return failure(invalid("schemaVersion"));
  }

  if (typeof input["repositoryId"] !== "string") return failure(invalid("repositoryId"));
  const repositoryId = parseRepositoryId(input["repositoryId"]);
  if (repositoryId.status === ResultStatus.Failure) return failure(repositoryId.error);

  const planId = readIdentifier(input["planId"]);
  const worktreeId = readIdentifier(input["worktreeId"]);
  const expectedBranchName = readRevision(input["expectedBranchName"]);
  const baseRevision = readRevision(input["baseRevision"]);
  const targetRevision = readRevision(input["targetRevision"]);
  if (planId === undefined) return failure(invalid("planId"));
  if (worktreeId === undefined) return failure(invalid("worktreeId"));
  if (expectedBranchName === undefined) return failure(invalid("expectedBranchName"));
  if (baseRevision === undefined) return failure(invalid("baseRevision"));
  if (targetRevision === undefined) return failure(invalid("targetRevision"));
  if (!Array.isArray(input["checks"]) || input["checks"].length === 0) {
    return failure(invalid("checks"));
  }

  const checks: VerificationCheck[] = [];
  for (const [index, candidate] of input["checks"].entries()) {
    const parsed = parseVerificationCheck(candidate, `checks[${index}]`);
    if (parsed.status === ResultStatus.Failure) return parsed;
    checks.push(parsed.value);
  }
  const sortedIds = checks.map((check) => check.checkId).sort(compare);
  if (
    !sameOrderedValues(
      checks.map((check) => check.checkId),
      sortedIds,
    )
  ) {
    return failure(invalid("checks"));
  }
  if (new Set(sortedIds).size !== sortedIds.length) return failure(invalid("checks"));

  return success({
    schemaVersion: VERIFICATION_PLAN_SCHEMA_VERSION,
    planId,
    repositoryId: repositoryId.value,
    worktreeId,
    expectedBranchName,
    baseRevision,
    targetRevision,
    checks,
  });
}

/** 校验单个 Verification Check，并复用 Plan 使用的同一组不变量。 */
export function validateVerificationCheck(input: unknown): Result<VerificationCheck, HarnessError> {
  return parseVerificationCheck(input, "check");
}

function parseVerificationCheck(
  input: unknown,
  field: string,
): Result<VerificationCheck, HarnessError> {
  if (!isRecord(input)) return failure(invalid(field));
  const checkId = readIdentifier(input["checkId"]);
  if (checkId === undefined) return failure(invalid(`${field}.checkId`));
  if (!isEnumValue(VerificationKind, input["kind"])) return failure(invalid(`${field}.kind`));
  if (!isEnumValue(VerificationRequirement, input["requirement"])) {
    return failure(invalid(`${field}.requirement`));
  }
  if (!isRecord(input["command"])) return failure(invalid(`${field}.command`));
  const command = parseCommand(input["command"], `${field}.command`);
  if (command.status === ResultStatus.Failure) return command;
  if (!isPositiveInteger(input["timeoutMs"]) || input["timeoutMs"] > MAX_VERIFICATION_TIMEOUT_MS) {
    return failure(invalid(`${field}.timeoutMs`));
  }
  if (typeof input["retryable"] !== "boolean") return failure(invalid(`${field}.retryable`));

  return success({
    checkId,
    kind: input["kind"],
    requirement: input["requirement"],
    command: command.value,
    timeoutMs: input["timeoutMs"],
    retryable: input["retryable"],
  });
}

function parseCommand(
  input: Record<string, unknown>,
  field: string,
): Result<VerificationCommandSpec, HarnessError> {
  const executable = readString(input["executable"], MAX_VERIFICATION_EXECUTABLE_LENGTH);
  if (executable === undefined || /\s/u.test(executable)) {
    return failure(invalid(`${field}.executable`));
  }
  if (!Array.isArray(input["args"]) || input["args"].length > MAX_VERIFICATION_ARGUMENT_COUNT) {
    return failure(invalid(`${field}.args`));
  }
  const args: string[] = [];
  for (const [index, value] of input["args"].entries()) {
    const argument = readString(value, MAX_VERIFICATION_EXECUTABLE_LENGTH);
    if (argument === undefined) return failure(invalid(`${field}.args[${index}]`));
    args.push(argument);
  }

  const workingDirectory = input["workingDirectory"];
  if (
    typeof workingDirectory !== "string" ||
    normalizeRelativePath(workingDirectory) === undefined
  ) {
    return failure(invalid(`${field}.workingDirectory`));
  }
  if (!Array.isArray(input["allowedEnvironmentKeys"])) {
    return failure(invalid(`${field}.allowedEnvironmentKeys`));
  }
  const allowedEnvironmentKeys: string[] = [];
  for (const [index, value] of input["allowedEnvironmentKeys"].entries()) {
    const key = readString(value, MAX_VERIFICATION_IDENTIFIER_LENGTH);
    if (key === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      return failure(invalid(`${field}.allowedEnvironmentKeys[${index}]`));
    }
    allowedEnvironmentKeys.push(key);
  }
  const sortedKeys = [...allowedEnvironmentKeys].sort(compare);
  if (!sameOrderedValues(allowedEnvironmentKeys, sortedKeys)) {
    return failure(invalid(`${field}.allowedEnvironmentKeys`));
  }
  if (new Set(sortedKeys).size !== sortedKeys.length) {
    return failure(invalid(`${field}.allowedEnvironmentKeys`));
  }

  return success({ executable, args, workingDirectory, allowedEnvironmentKeys });
}

function readIdentifier(value: unknown): string | undefined {
  return readString(value, MAX_VERIFICATION_IDENTIFIER_LENGTH);
}

function readRevision(value: unknown): string | undefined {
  const revision = readString(value, MAX_VERIFICATION_IDENTIFIER_LENGTH);
  return revision === undefined || /\s/u.test(revision) || revision.startsWith("-")
    ? undefined
    : revision;
}

function readString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : undefined;
}

function normalizeRelativePath(value: string): string | undefined {
  if (value === "") return "";
  if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return undefined;
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return undefined;
  }
  if (segments.some((segment) => /[<>:"|?*\u0000]/u.test(segment))) return undefined;
  return segments.join("/") === value ? value : undefined;
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalid(field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "Verification Plan is invalid.", {
    field,
  });
}
