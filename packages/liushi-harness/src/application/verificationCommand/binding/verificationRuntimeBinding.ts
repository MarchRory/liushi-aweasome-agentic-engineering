import type { ContentDigestPort } from "#application/ports/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";

import type { VerificationCommandRuntimeContext } from "../contracts/index.js";

/** 对 Runtime Worktree Root 计算不泄露明文的摘要。 */
export function calculateVerificationRuntimeDigest(
  digest: ContentDigestPort,
  runtime: VerificationCommandRuntimeContext,
): Result<ContentDigest, HarnessError> {
  return digest.calculate({ worktreeRoot: runtime.worktreeRoot });
}
