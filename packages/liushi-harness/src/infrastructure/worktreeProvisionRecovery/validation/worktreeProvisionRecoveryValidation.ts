import { isAbsolute } from "node:path";

import type { InspectWorktreeProvisionRecoveryInput } from "#application/ports/index.js";
import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { assertCodingTaskCreationBinding, normalizeWriteSet } from "#domain/codingTask/index.js";

/** 校验专用恢复检查输入，不接受非规范化写集。 */
export function validateWorktreeProvisionRecoveryInput(
  input: InspectWorktreeProvisionRecoveryInput,
): Result<InspectWorktreeProvisionRecoveryInput, HarnessError> {
  try {
    if (!isAbsolute(input.repositoryRoot) || input.repositoryRoot.includes("\0")) throw new Error();
    assertCodingTaskCreationBinding(input.baseRevision, input.worktreeBinding);
    const normalized = normalizeWriteSet(input.writeSet);
    if (
      normalized.length !== input.writeSet.length ||
      normalized.some((path, index) => path !== input.writeSet[index])
    ) {
      throw new Error();
    }
    return success(input);
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Worktree Provision 恢复检查输入无效。",
        {},
        error,
      ),
    );
  }
}
