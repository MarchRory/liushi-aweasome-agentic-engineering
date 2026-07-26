import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import { normalizeWriteSet } from "#domain/codingTask/index.js";
import { parseRepositoryId } from "#domain/workspace/index.js";

import {
  CODING_TASK_SESSION_CHANGE_SET_SCHEMA_VERSION,
  CODING_TASK_SESSION_CHANGE_SET_SNAPSHOT_SCHEMA_VERSION,
} from "../constants/index.js";
import {
  canonicalizeCodingTaskSessionChange,
  isCanonicalCodingTaskSessionChangeSet,
} from "../canonicalization/index.js";
import type {
  CodingTaskSessionChange,
  CodingTaskSessionChangePathInput,
  CodingTaskSessionChangeSet,
  CodingTaskSessionChangeSetDigestInput,
  CodingTaskSessionChangeSetSnapshotDigestInput,
} from "../contracts/index.js";
import { CodingTaskSessionChangeKind } from "../enums/index.js";

/** 校验并规范化一项 ChangeSet 路径与变化类型。 */
export function validateCodingTaskSessionChangePath(
  input: unknown,
): Result<CodingTaskSessionChangePathInput, HarnessErrorType> {
  if (!isObject(input) || !isCodingTaskSessionChangeKind(input["kind"])) {
    return failure(invalid("change.kind"));
  }
  const kind = input["kind"];

  const path = normalizeSinglePath(input["path"], "change.path");
  if (path.status === ResultStatus.Failure) return path;

  const requiresOriginalPath =
    kind === CodingTaskSessionChangeKind.Renamed || kind === CodingTaskSessionChangeKind.Copied;
  if (requiresOriginalPath !== (input["originalPath"] !== undefined)) {
    return failure(invalid("change.originalPath"));
  }
  if (!requiresOriginalPath) {
    return success({ path: path.value, kind });
  }

  const originalPath = normalizeSinglePath(input["originalPath"], "change.originalPath");
  if (originalPath.status === ResultStatus.Failure) return originalPath;
  if (originalPath.value === path.value) return failure(invalid("change.originalPath"));
  return success({ path: path.value, originalPath: originalPath.value, kind });
}

/** 校验并规范化一项带目标内容摘要的 ChangeSet 变化。 */
export function validateCodingTaskSessionChange(
  input: unknown,
): Result<CodingTaskSessionChange, HarnessErrorType> {
  const path = validateCodingTaskSessionChangePath(input);
  if (path.status === ResultStatus.Failure) return path;
  if (!isObject(input)) return failure(invalid("change"));
  const targetContentDigest = input["targetContentDigest"];

  if (path.value.kind === CodingTaskSessionChangeKind.Deleted) {
    return targetContentDigest === null
      ? success({ ...path.value, targetContentDigest: null })
      : failure(invalid("change.targetContentDigest"));
  }

  if (targetContentDigest === null || typeof targetContentDigest !== "string") {
    return failure(invalid("change.targetContentDigest"));
  }
  const digest = parseContentDigest(targetContentDigest);
  if (digest.status === ResultStatus.Failure) return failure(invalid("change.targetContentDigest"));
  return success({ ...path.value, targetContentDigest: digest.value });
}

/** 判断变化类型是否属于生产 ChangeSet 支持范围。 */
export function isSupportedCodingTaskSessionChangeKind(kind: CodingTaskSessionChangeKind): boolean {
  return (
    kind === CodingTaskSessionChangeKind.Modified ||
    kind === CodingTaskSessionChangeKind.Added ||
    kind === CodingTaskSessionChangeKind.Deleted ||
    kind === CodingTaskSessionChangeKind.Renamed ||
    kind === CodingTaskSessionChangeKind.Copied ||
    kind === CodingTaskSessionChangeKind.TypeChanged
  );
}

/** 校验 ChangeSet 输入并返回去重、稳定排序后的规范字段。 */
export function validateCodingTaskSessionChangeSetInput(
  input: CodingTaskSessionChangeSetDigestInput,
): Result<CodingTaskSessionChangeSetDigestInput, HarnessErrorType> {
  if (!isObject(input) || typeof input.baseRevision !== "string") {
    return failure(invalid("changeSet"));
  }
  if (input.schemaVersion !== CODING_TASK_SESSION_CHANGE_SET_SCHEMA_VERSION) {
    return failure(invalid("schemaVersion"));
  }
  const repositoryId = parseRepositoryId(input.repositoryId);
  if (repositoryId.status === ResultStatus.Failure) return repositoryId;
  if (!isSafeRevision(input.baseRevision)) return failure(invalid("baseRevision"));
  if (!Array.isArray(input.changes) || input.changes.length === 0) {
    return failure(invalid("changes"));
  }

  const changes: CodingTaskSessionChange[] = [];
  for (const change of input.changes) {
    const validated = validateCodingTaskSessionChange(change);
    if (validated.status === ResultStatus.Failure) return validated;
    if (!isSupportedCodingTaskSessionChangeKind(validated.value.kind)) {
      return failure(invalid("change.kind"));
    }
    changes.push(...canonicalizeCodingTaskSessionChange(validated.value));
  }

  const targetPaths = new Set<string>();
  for (const change of changes) {
    if (targetPaths.has(change.path)) return failure(invalid("changes"));
    targetPaths.add(change.path);
  }

  return success({
    schemaVersion: input.schemaVersion,
    repositoryId: repositoryId.value,
    baseRevision: input.baseRevision,
    changes: changes.sort(compareChanges),
  });
}

/** 校验已完成摘要绑定的 ChangeSet 结构。 */
export function validateCodingTaskSessionChangeSet(
  input: CodingTaskSessionChangeSet,
): Result<CodingTaskSessionChangeSet, HarnessErrorType> {
  const validated = validateCodingTaskSessionChangeSetInput(input);
  if (validated.status === ResultStatus.Failure) return validated;
  if (!isCanonicalCodingTaskSessionChangeSet(input.changes, validated.value.changes)) {
    return failure(invalid("changes"));
  }
  const digest = parseContentDigest(input.changeSetDigest);
  if (digest.status === ResultStatus.Failure) return failure(invalid("changeSetDigest"));
  return success({ ...validated.value, changeSetDigest: digest.value });
}

/** 从规范变化集合派生并稳定排序所有受影响路径。 */
export function collectCodingTaskSessionChangeSetChangedPaths(
  changes: readonly CodingTaskSessionChange[],
): readonly string[] {
  return [
    ...new Set(changes.flatMap((change) => [change.path, change.originalPath].filter(isPath))),
  ].sort(comparePaths);
}

/** 校验 Snapshot 的元数据、Write Set 和变化路径绑定。 */
export function validateCodingTaskSessionChangeSetSnapshotInput(
  input: CodingTaskSessionChangeSetSnapshotDigestInput,
): Result<CodingTaskSessionChangeSetSnapshotDigestInput, HarnessErrorType> {
  if (
    !isObject(input) ||
    typeof input.worktreeId !== "string" ||
    typeof input.worktreeRelativePath !== "string" ||
    typeof input.branchName !== "string" ||
    typeof input.observedHeadRevision !== "string"
  ) {
    return failure(invalid("snapshot"));
  }
  if (input.schemaVersion !== CODING_TASK_SESSION_CHANGE_SET_SNAPSHOT_SCHEMA_VERSION) {
    return failure(invalid("schemaVersion"));
  }
  if (
    !isSafeValue(input.worktreeId) ||
    !isSafeValue(input.branchName) ||
    !isSafeRevision(input.observedHeadRevision)
  ) {
    return failure(invalid("snapshot"));
  }
  const worktreePath = normalizeSinglePath(input.worktreeRelativePath, "worktreeRelativePath");
  if (worktreePath.status === ResultStatus.Failure) return worktreePath;
  let writeSet: readonly string[];
  try {
    writeSet = normalizeWriteSet(input.writeSet);
  } catch {
    return failure(invalid("writeSet"));
  }
  if (!sameOrderedPaths(input.writeSet, writeSet)) return failure(invalid("writeSet"));

  const changeSet = validateCodingTaskSessionChangeSet({
    schemaVersion: CODING_TASK_SESSION_CHANGE_SET_SCHEMA_VERSION,
    repositoryId: input.repositoryId,
    baseRevision: input.baseRevision,
    changes: input.changes,
    changeSetDigest: input.changeSetDigest,
  });
  if (changeSet.status === ResultStatus.Failure) return changeSet;
  const changedPaths = collectCodingTaskSessionChangeSetChangedPaths(changeSet.value.changes);
  if (!sameOrderedPaths(input.changedPaths, changedPaths)) {
    return failure(invalid("changedPaths"));
  }
  if (changedPaths.some((path) => !writeSet.includes(path))) {
    return failure(invalid("writeSet"));
  }
  return success({
    ...input,
    repositoryId: changeSet.value.repositoryId,
    baseRevision: changeSet.value.baseRevision,
    worktreeRelativePath: worktreePath.value,
    writeSet,
    changedPaths,
    changes: changeSet.value.changes,
    changeSetDigest: changeSet.value.changeSetDigest,
  });
}

function normalizeSinglePath(value: unknown, field: string): Result<string, HarnessErrorType> {
  if (typeof value !== "string") return failure(invalid(field));
  try {
    const normalized = normalizeWriteSet([value]);
    const first = normalized[0];
    return first !== undefined && first === value ? success(first) : failure(invalid(field));
  } catch {
    return failure(invalid(field));
  }
}

function isCodingTaskSessionChangeKind(value: unknown): value is CodingTaskSessionChangeKind {
  return (
    typeof value === "string" &&
    Object.values(CodingTaskSessionChangeKind).includes(value as CodingTaskSessionChangeKind)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeRevision(value: string): boolean {
  return /^[0-9a-f]{40,128}$/iu.test(value);
}

function isSafeValue(value: string): boolean {
  return value.length > 0 && !/[\u0000-\u001f\u007f]/u.test(value) && !value.includes("\\");
}

function isPath(value: string | undefined): value is string {
  return value !== undefined;
}

function sameOrderedPaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function compareChanges(left: CodingTaskSessionChange, right: CodingTaskSessionChange): number {
  const pathOrder = comparePaths(left.path, right.path);
  if (pathOrder !== 0) return pathOrder;
  const originalOrder = comparePaths(left.originalPath ?? "", right.originalPath ?? "");
  if (originalOrder !== 0) return originalOrder;
  return comparePaths(left.kind, right.kind);
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalid(field: string): HarnessErrorType {
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    "CodingTask Session ChangeSet 输入无效。",
    {
      field,
    },
  );
}
