import { isAbsolute, resolve } from "node:path";

import type {
  CodingTaskCellRuntimePathPort,
  ResolveCodingTaskCellWorktreeRootInput,
} from "#application/codingTaskCell/index.js";
import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

/** 使用当前 Node 宿主语义推导受管 Worktree 的规范绝对路径。 */
export class NodeCodingTaskCellRuntimePathAdapter implements CodingTaskCellRuntimePathPort {
  /** 拒绝非规范根目录或非法相对路径，并返回唯一目标路径。 */
  public resolveManagedWorktreeRoot(
    input: ResolveCodingTaskCellWorktreeRootInput,
  ): Result<string, HarnessError> {
    if (!isCanonicalAbsolutePath(input.repositoryRoot)) {
      return failure(invalidPath("repositoryRoot"));
    }
    if (!isCanonicalRelativePath(input.worktreeRelativePath)) {
      return failure(invalidPath("worktreeRelativePath"));
    }
    return success(resolve(input.repositoryRoot, ...input.worktreeRelativePath.split("/")));
  }
}

function isCanonicalAbsolutePath(value: string): boolean {
  return isAbsolute(value) && resolve(value) === value;
}

function isCanonicalRelativePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.trim() !== value ||
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function invalidPath(field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "CodingTask Cell Runtime Path 无效。", {
    field,
  });
}
