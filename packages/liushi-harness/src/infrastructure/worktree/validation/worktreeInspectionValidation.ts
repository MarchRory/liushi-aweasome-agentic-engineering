import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";
import {
  assertCodingTaskCreationBinding,
  normalizeWriteSet,
  type WorktreeBinding,
} from "#domain/codingTask/index.js";
import { parseRepositoryId, type RepositoryId } from "#domain/workspace/index.js";

import type { InspectWorktreeInput } from "#application/ports/worktree/index.js";

/** 已完成输入校验且可交给运行时 Adapter 使用的检查输入。 */
export interface ValidatedWorktreeInspectionInput {
  /** Repository 的稳定标识。 */
  repositoryId: RepositoryId;
  /** 已确认是绝对路径的运行时 Repository Root。 */
  repositoryRoot: string;
  /** 已通过 CodingTask Worktree 绑定校验的绑定信息。 */
  worktreeBinding: WorktreeBinding;
  /** 已通过参数安全校验的 Base Revision。 */
  baseRevision: string;
  /** 已按 CodingTask 语义规范化的 Write Set。 */
  writeSet: readonly string[];
}

/** 校验 Worktree Inspector 的公开输入并规范化 Write Set。 */
export function validateWorktreeInspectionInput(
  input: InspectWorktreeInput,
): Result<ValidatedWorktreeInspectionInput, HarnessError> {
  if (!isObject(input)) {
    return failure(invalidInput("input"));
  }

  if (typeof input.repositoryId !== "string") {
    return failure(invalidInput("repositoryId"));
  }

  const repositoryId = parseRepositoryId(input.repositoryId);
  if (repositoryId.status === ResultStatus.Failure) {
    return failure(repositoryId.error);
  }

  if (
    typeof input.repositoryRoot !== "string" ||
    !isAbsolutePath(input.repositoryRoot) ||
    containsControlCharacter(input.repositoryRoot)
  ) {
    return failure(invalidInput("repositoryRoot"));
  }

  if (!isWorktreeBinding(input.worktreeBinding)) {
    return failure(invalidInput("worktreeBinding"));
  }

  if (
    !isSafeReportedValue(input.worktreeBinding.worktreeId) ||
    !isSafeReportedValue(input.worktreeBinding.branchName)
  ) {
    return failure(invalidInput("worktreeBinding"));
  }

  if (typeof input.baseRevision !== "string") {
    return failure(invalidInput("baseRevision"));
  }

  try {
    assertCodingTaskCreationBinding(input.baseRevision, input.worktreeBinding);
  } catch (error) {
    return failure(toInvalidInput(error, "worktreeBinding"));
  }

  if (!isSafeRevision(input.baseRevision)) {
    return failure(invalidInput("baseRevision"));
  }

  if (!Array.isArray(input.writeSet)) {
    return failure(invalidInput("writeSet"));
  }

  let writeSet: readonly string[];
  try {
    writeSet = normalizeWriteSet(input.writeSet);
  } catch (error) {
    return failure(toInvalidInput(error, "writeSet"));
  }

  if (!sameOrderedPaths(input.writeSet, writeSet)) {
    return failure(invalidInput("writeSet"));
  }

  return success({
    repositoryId: repositoryId.value,
    repositoryRoot: input.repositoryRoot,
    worktreeBinding: input.worktreeBinding,
    baseRevision: input.baseRevision,
    writeSet,
  });
}

function isObject(value: unknown): value is InspectWorktreeInput {
  return typeof value === "object" && value !== null;
}

function isWorktreeBinding(value: unknown): value is WorktreeBinding {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["worktreeId"] === "string" &&
    typeof candidate["relativePath"] === "string" &&
    typeof candidate["branchName"] === "string" &&
    typeof candidate["managed"] === "boolean"
  );
}

function isAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("/") || value.startsWith("\\\\");
}

function containsControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(value);
}

function isSafeRevision(value: string): boolean {
  return (
    value.length <= 512 &&
    value.trim() === value &&
    value.length > 0 &&
    !value.startsWith("-") &&
    !containsControlCharacter(value) &&
    !/\s/u.test(value) &&
    !isAbsolutePath(value) &&
    !hasParentPathSegment(value)
  );
}

function isSafeReportedValue(value: string): boolean {
  return value.length > 0 && !containsControlCharacter(value) && !isAbsolutePath(value);
}

function hasParentPathSegment(value: string): boolean {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .some((segment) => segment === "..");
}

function sameOrderedPaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function toInvalidInput(error: unknown, field: string): HarnessError {
  if (error instanceof HarnessError && error.code === HarnessErrorCode.InvalidInput) {
    return new HarnessError(HarnessErrorCode.InvalidInput, "Worktree Inspector input is invalid.", {
      field,
    });
  }
  return invalidInput(field);
}

function invalidInput(field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "Worktree Inspector input is invalid.", {
    field,
  });
}
