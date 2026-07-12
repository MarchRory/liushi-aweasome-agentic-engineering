import type { ContentDigestPort } from "#application/ports/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";

import type { ImplementationCommandRuntimeContext } from "../contracts/index.js";

/** 对运行时明文路径计算不可逆联合摘要。 */
export function calculateImplementationRuntimeDigest(
  digest: ContentDigestPort,
  runtime: ImplementationCommandRuntimeContext,
): Result<ContentDigest, HarnessError> {
  return digest.calculate({
    repositoryRoot: runtime.repositoryRoot,
    worktreeRoot: runtime.worktreeRoot,
  });
}
