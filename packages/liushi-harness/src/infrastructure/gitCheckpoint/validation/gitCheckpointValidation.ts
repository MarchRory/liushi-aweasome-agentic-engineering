import type { GitCheckpointInput } from "#application/ports/index.js";
import { normalizeWriteSet } from "#domain/codingTask/index.js";

/** 判断 Git Checkpoint 输入是否满足副作用前的基础安全约束。 */
export function isSafeGitCheckpointInput(input: GitCheckpointInput): boolean {
  if (
    !input.worktreeBinding.managed ||
    !isSafeRevision(input.baseRevision) ||
    input.commitMessage.length === 0 ||
    input.commitMessage.trim() !== input.commitMessage ||
    /[\u0000-\u001f\u007f]/u.test(input.commitMessage)
  ) {
    return false;
  }
  try {
    return sameGitCheckpointPaths(normalizeWriteSet(input.writeSet), input.writeSet);
  } catch {
    return false;
  }
}

/** 判断 Git 返回值是否为完整十六进制 Revision。 */
export function isGitCheckpointRevision(value: string): boolean {
  return /^[0-9a-f]{40,128}$/iu.test(value);
}

/** 按顺序比较两组规范路径。 */
export function sameGitCheckpointPaths(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length && actual.every((path, index) => path === expected[index])
  );
}

function isSafeRevision(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 512 &&
    value.trim() === value &&
    !value.startsWith("-") &&
    !/[\u0000-\u0020\u007f]/u.test(value)
  );
}
