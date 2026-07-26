import type { InspectCommittedGitChangeSetInput } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { normalizeWriteSet } from "#domain/codingTask/index.js";
import { parseRepositoryId } from "#domain/workspace/index.js";

const ALLOWED_INPUT_KEYS = new Set([
  "repositoryId",
  "repositoryRoot",
  "worktreeBinding",
  "baseRevision",
  "targetRevision",
  "writeSet",
]);

/** 校验并规范化已提交 Git ChangeSet Inspector 输入。 */
export function validateCommittedGitChangeSetInput(
  input: InspectCommittedGitChangeSetInput,
): Result<InspectCommittedGitChangeSetInput, HarnessError> {
  if (!isRecord(input) || !hasOnlyAllowedInputKeys(input)) {
    return failure(committedGitChangeSetInputInvalid("input"));
  }

  const repositoryId = input["repositoryId"];
  const repositoryRoot = input["repositoryRoot"];
  const worktreeBinding = input["worktreeBinding"];
  const baseRevision = input["baseRevision"];
  const targetRevision = input["targetRevision"];
  const writeSet = input["writeSet"];
  if (
    typeof repositoryId !== "string" ||
    typeof repositoryRoot !== "string" ||
    repositoryRoot.length === 0 ||
    !isRecord(worktreeBinding) ||
    worktreeBinding["managed"] !== true ||
    typeof worktreeBinding["worktreeId"] !== "string" ||
    typeof worktreeBinding["relativePath"] !== "string" ||
    typeof worktreeBinding["branchName"] !== "string" ||
    typeof baseRevision !== "string" ||
    typeof targetRevision !== "string" ||
    !Array.isArray(writeSet) ||
    writeSet.length === 0 ||
    !writeSet.every((path) => typeof path === "string") ||
    !isSafeRevision(baseRevision) ||
    !isSafeRevision(targetRevision) ||
    baseRevision.toLowerCase() === targetRevision.toLowerCase()
  ) {
    return failure(committedGitChangeSetInputInvalid("input"));
  }

  const parsedRepositoryId = parseRepositoryId(repositoryId);
  if (parsedRepositoryId.status === ResultStatus.Failure) {
    return failure(committedGitChangeSetInputInvalid("repositoryId"));
  }

  let normalizedWriteSet: readonly string[];
  try {
    normalizedWriteSet = normalizeWriteSet(writeSet);
  } catch {
    return failure(committedGitChangeSetInputInvalid("writeSet"));
  }
  if (!sameOrderedPaths(writeSet, normalizedWriteSet)) {
    return failure(committedGitChangeSetInputInvalid("writeSet"));
  }

  return success({
    ...input,
    repositoryId: parsedRepositoryId.value,
    writeSet: normalizedWriteSet,
  });
}

/** 比较可选实际 Revision 与期望 Revision。 */
export function isSameCommittedGitRevision(value: string | undefined, expected: string): boolean {
  return value !== undefined && value.toLowerCase() === expected.toLowerCase();
}

/** 按顺序比较两组规范路径。 */
export function sameCommittedGitChangeSetPaths(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return sameOrderedPaths(left, right);
}

/** 创建不泄露运行时路径的输入错误。 */
export function committedGitChangeSetInputInvalid(field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "已提交 Git ChangeSet 输入无效。", {
    field,
  });
}

function hasOnlyAllowedInputKeys(input: Record<string, unknown>): boolean {
  return Object.keys(input).every((key) => ALLOWED_INPUT_KEYS.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeRevision(value: string): boolean {
  return /^[0-9a-f]{40,128}$/iu.test(value);
}

function sameOrderedPaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}
